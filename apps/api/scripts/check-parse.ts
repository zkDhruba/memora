/**
 * End-to-end: upload plain.txt + notes.md fixtures → worker parse → documents rows.
 *
 * Boots its own worker (like check-job-retry). Needs API on :4000 for upload,
 * or set SKIP_API=1 to only assert unit path is covered by vitest.
 *
 * Usage (deps up, migrate applied, ClamAV or CLAMAV_SKIP=true):
 *   pnpm --filter @memora/api build
 *   pnpm --filter @memora/api start          # another terminal
 *   pnpm --filter @memora/api exec tsx scripts/check-parse.ts
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
      displayName: "Parse Check",
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
  return { userId, jar };
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

async function waitParsed(
  fileId: string,
  expectKind: string,
  timeoutMs = 45_000,
) {
  const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
  const start = Date.now();
  try {
    while (Date.now() - start < timeoutMs) {
      const file = await db.query.sourceFiles.findFirst({
        where: eq(sourceFiles.id, fileId),
      });
      if (file?.status === "parsed") {
        const version = await db.query.sourceFileVersions.findFirst({
          where: eq(sourceFileVersions.fileId, fileId),
        });
        if (!version) throw new Error("missing version");
        const doc = await db.query.documents.findFirst({
          where: eq(documents.fileVersionId, version.id),
        });
        if (!doc) throw new Error("parsed but no document row");
        if (doc.kind !== expectKind) {
          throw new Error(`expected kind ${expectKind}, got ${doc.kind}`);
        }
        if (!doc.preview || doc.charCount < 1) {
          throw new Error("document missing preview/charCount");
        }
        return { file, doc, version };
      }
      if (file?.status === "needs_attention") {
        throw new Error(`file needs_attention: ${fileId}`);
      }
      await sleep(250);
    }
    const file = await db.query.sourceFiles.findFirst({
      where: eq(sourceFiles.id, fileId),
    });
    throw new Error(
      `timeout waiting for parsed; status=${file?.status ?? "missing"}`,
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
    const { jar } = await registerVerifyLogin(
      `parse-${suffix}@test.local`,
      "TestPass123!",
    );
    const cookie = jar.cookie;

    const create = await fetch(`${API}/api/v1/personas`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        scenario: "living",
        displayName: `Parse ${suffix}`,
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

    const plainBody = readFileSync(join(fixtures, "plain.txt"));
    const mdBody = readFileSync(join(fixtures, "notes.md"));

    const plainId = await uploadFixture(
      cookie,
      personaId,
      "plain.txt",
      "text/plain",
      plainBody,
    );
    console.log("uploaded plain", plainId);

    const mdId = await uploadFixture(
      cookie,
      personaId,
      "notes.md",
      "text/markdown",
      mdBody,
    );
    console.log("uploaded markdown", mdId);

    const plain = await waitParsed(plainId, "plain_text");
    console.log(
      "ok plain → documents",
      plain.doc.id,
      "chars",
      plain.doc.charCount,
      "date",
      (plain.version.parseReport as { documentDate?: string }).documentDate,
    );

    const md = await waitParsed(mdId, "markdown");
    console.log(
      "ok markdown → documents",
      md.doc.id,
      "chars",
      md.doc.charCount,
    );

    // Edge: whitespace-only → needs_attention
    const emptyId = await uploadFixture(
      cookie,
      personaId,
      "empty.txt",
      "text/plain",
      Buffer.from("   \n\t\n  ", "utf8"),
    );
    const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
    try {
      const start = Date.now();
      let status: string | undefined;
      while (Date.now() - start < 30_000) {
        const file = await db.query.sourceFiles.findFirst({
          where: eq(sourceFiles.id, emptyId),
        });
        status = file?.status;
        if (status === "needs_attention") break;
        await sleep(250);
      }
      if (status !== "needs_attention") {
        throw new Error(`expected needs_attention for empty, got ${status}`);
      }
      console.log("ok empty text → needs_attention");
    } finally {
      await client.end({ timeout: 5 });
    }

    console.log("parse check passed");
  } finally {
    await worker.close();
    await app.close();
    process.exit(0);
  }
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
