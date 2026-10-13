/**
 * End-to-end: upload DOCX + digital PDF + scanned PDF → parse outcomes.
 *
 * Usage (API on :4000; script boots its own worker):
 *   pnpm --filter @memora/api exec tsx scripts/check-docx-pdf.ts
 */
import "../src/load-env";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import {
  createDb,
  documents,
  sourceFiles,
  sourceFileVersions,
  users,
} from "@memora/db";
import { eq } from "drizzle-orm";
import { AppModule } from "../src/app.module";
import { IngestionProcessor } from "../src/jobs/ingestion.processor";
import { startIngestionWorker } from "../src/jobs/ingestion.worker";

const API = process.env.API_URL ?? "http://localhost:4000";
const fixtures = join(__dirname, "../fixtures");

type Jar = { cookie: string };

function captureCookies(res: Response, jar: Jar) {
  const set = res.headers.getSetCookie?.() ?? [];
  const parts = set.map((c) => c.split(";")[0]!).filter(Boolean);
  if (parts.length) {
    jar.cookie = [...(jar.cookie ? jar.cookie.split("; ") : []), ...parts].join(
      "; ",
    );
  }
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function registerVerifyLogin(email: string, password: string) {
  const reg = await fetch(`${API}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      displayName: "DocxPdf Check",
    }),
  });
  if (!reg.ok) {
    throw new Error(`register: ${reg.status} ${await reg.text()}`);
  }
  const { userId } = (await reg.json()) as { userId: string };

  const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
  try {
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, userId));
  } finally {
    await client.end({ timeout: 5 });
  }

  const jar: Jar = { cookie: "" };
  const login = await fetch(`${API}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  captureCookies(login, jar);
  if (!login.ok) {
    throw new Error(`login: ${login.status} ${await login.text()}`);
  }
  return jar;
}

async function uploadFixture(
  cookie: string,
  personaId: string,
  filename: string,
  mediaType: string,
  body: Buffer,
) {
  const headers = {
    "Content-Type": "application/json",
    Cookie: cookie,
  };
  const sha256 = createHash("sha256").update(body).digest("hex");

  const impRes = await fetch(`${API}/api/v1/personas/${personaId}/imports`, {
    method: "POST",
    headers,
    body: "{}",
  });
  if (!impRes.ok) {
    throw new Error(`create import: ${impRes.status} ${await impRes.text()}`);
  }
  const imp = (await impRes.json()) as { id: string };

  const preRes = await fetch(
    `${API}/api/v1/personas/${personaId}/files/presign`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        importId: imp.id,
        filename,
        mediaType,
        byteSize: body.length,
      }),
    },
  );
  if (!preRes.ok) {
    throw new Error(`presign: ${preRes.status} ${await preRes.text()}`);
  }
  const pre = (await preRes.json()) as {
    fileId: string;
    url: string;
    headers: Record<string, string>;
  };

  const put = await fetch(pre.url, {
    method: "PUT",
    headers: pre.headers,
    body,
  });
  if (!put.ok) {
    throw new Error(`PUT: ${put.status} ${await put.text()}`);
  }

  const done = await fetch(
    `${API}/api/v1/personas/${personaId}/files/${pre.fileId}/complete`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ sha256 }),
    },
  );
  if (!done.ok) {
    throw new Error(`complete: ${done.status} ${await done.text()}`);
  }
  const completed = (await done.json()) as { status: string };
  if (completed.status !== "clean") {
    throw new Error(`expected clean, got ${completed.status}`);
  }
  return pre.fileId;
}

async function waitStatus(
  fileId: string,
  want: string,
  timeoutMs = 45_000,
) {
  const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
  const start = Date.now();
  try {
    while (Date.now() - start < timeoutMs) {
      const file = await db.query.sourceFiles.findFirst({
        where: eq(sourceFiles.id, fileId),
      });
      if (file?.status === want) {
        const version = await db.query.sourceFileVersions.findFirst({
          where: eq(sourceFileVersions.fileId, fileId),
        });
        const doc = version
          ? await db.query.documents.findFirst({
              where: eq(documents.fileVersionId, version.id),
            })
          : undefined;
        return { file, version, doc };
      }
      await sleep(250);
    }
    const file = await db.query.sourceFiles.findFirst({
      where: eq(sourceFiles.id, fileId),
    });
    throw new Error(
      `timeout waiting for ${want}; status=${file?.status ?? "missing"}`,
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const processor = app.get(IngestionProcessor);
  const worker = startIngestionWorker(processor);

  try {
    const suffix = randomUUID().slice(0, 8);
    const jar = await registerVerifyLogin(
      `docxpdf-${suffix}@test.local`,
      "TestPass123!",
    );
    const cookie = jar.cookie;

    const create = await fetch(`${API}/api/v1/personas`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        scenario: "living",
        displayName: `DocxPdf ${suffix}`,
        languages: ["en"],
        attestation: {
          kind: "self",
          statement: "I am creating this persona for myself.",
        },
        consents: [
          { purpose: "host_records", statementVersion: "v1" },
          { purpose: "converse", statementVersion: "v1" },
        ],
      }),
    });
    if (!create.ok) {
      throw new Error(`create persona: ${create.status} ${await create.text()}`);
    }
    const personaId = ((await create.json()) as { id: string }).id;
    console.log("persona", personaId);

    const docxId = await uploadFixture(
      cookie,
      personaId,
      "sample.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      readFileSync(join(fixtures, "sample.docx")),
    );
    const digitalId = await uploadFixture(
      cookie,
      personaId,
      "digital.pdf",
      "application/pdf",
      readFileSync(join(fixtures, "digital.pdf")),
    );
    const scannedId = await uploadFixture(
      cookie,
      personaId,
      "scanned.pdf",
      "application/pdf",
      readFileSync(join(fixtures, "scanned.pdf")),
    );

    const docx = await waitStatus(docxId, "parsed");
    if (!docx.doc || docx.doc.kind !== "markdown") {
      throw new Error(`docx expected markdown document, got ${docx.doc?.kind}`);
    }
    console.log("ok docx → documents", docx.doc.id, "chars", docx.doc.charCount);

    const digital = await waitStatus(digitalId, "parsed");
    if (!digital.doc || digital.doc.kind !== "prose") {
      throw new Error(
        `pdf expected prose document, got ${digital.doc?.kind}`,
      );
    }
    console.log(
      "ok digital pdf → documents",
      digital.doc.id,
      "chars",
      digital.doc.charCount,
    );

    const scanned = await waitStatus(scannedId, "needs_attention");
    const report = (scanned.version?.parseReport ?? {}) as {
      parse?: string;
      errorCode?: string;
    };
    if (report.parse !== "needs_ocr" || report.errorCode !== "NEEDS_OCR") {
      throw new Error(`expected needs_ocr report, got ${JSON.stringify(report)}`);
    }
    if (scanned.doc) {
      throw new Error("scanned PDF should not create a documents row");
    }
    console.log("ok scanned pdf → needs_ocr / needs_attention");
    console.log("docx-pdf check passed");
  } finally {
    await worker.close();
    await app.close();
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
