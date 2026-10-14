/**
 * Upload two files → purge A → assert B chunks remain, A gone.
 *
 * Usage (API + worker running):
 *   pnpm --filter @memora/api exec tsx scripts/check-purge.ts
 */
import "../src/load-env";
import { createHash, randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import {
  createDb,
  documentChunks,
  sourceFiles,
  users,
} from "@memora/db";
import { and, count, eq, ne } from "drizzle-orm";
import { AppModule } from "../src/app.module";
import { IngestionProcessor } from "../src/jobs/ingestion.processor";
import { startIngestionWorker } from "../src/jobs/ingestion.worker";

const API = process.env.API_URL ?? "http://localhost:4000";

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

async function uploadTxt(
  headers: Record<string, string>,
  personaId: string,
  importId: string,
  filename: string,
  body: string,
) {
  const bytes = Buffer.from(body, "utf8");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const pre = await fetch(`${API}/api/v1/personas/${personaId}/files/presign`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      importId,
      filename,
      mediaType: "text/plain",
      byteSize: bytes.length,
    }),
  });
  if (!pre.ok) throw new Error(`presign ${pre.status} ${await pre.text()}`);
  const signed = (await pre.json()) as {
    fileId: string;
    url: string;
    headers: Record<string, string>;
  };
  const put = await fetch(signed.url, {
    method: "PUT",
    headers: signed.headers,
    body: bytes,
  });
  if (!put.ok) throw new Error(`put ${put.status}`);
  const done = await fetch(
    `${API}/api/v1/personas/${personaId}/files/${signed.fileId}/complete`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ sha256 }),
    },
  );
  if (!done.ok) throw new Error(`complete ${done.status} ${await done.text()}`);
  return signed.fileId;
}

async function waitParsed(fileId: string, timeoutMs = 60_000) {
  const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
  try {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const f = await db.query.sourceFiles.findFirst({
        where: eq(sourceFiles.id, fileId),
      });
      if (f?.status === "parsed" || f?.status === "needs_attention") {
        return f.status;
      }
      await sleep(500);
    }
    throw new Error(`timeout waiting for parse on ${fileId}`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const worker = startIngestionWorker(app.get(IngestionProcessor));

  try {
    const suffix = randomUUID().slice(0, 8);
    const email = `purge-${suffix}@test.local`;
    const password = "TestPass123!";

    const reg = await fetch(`${API}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Purge" }),
    });
    if (!reg.ok) throw new Error(`register ${reg.status}`);
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
    const headers = {
      "Content-Type": "application/json",
      Cookie: jar.cookie,
    };

    const create = await fetch(`${API}/api/v1/personas`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        scenario: "living",
        displayName: `Purge ${suffix}`,
        languages: ["en"],
        attestation: {
          kind: "self",
          statement: "I am the subject.",
        },
        consents: [
          { purpose: "host_records", statementVersion: "v1" },
          { purpose: "converse", statementVersion: "v1" },
        ],
      }),
    });
    if (!create.ok) throw new Error(`persona ${create.status}`);
    const persona = (await create.json()) as { id: string };

    const impRes = await fetch(
      `${API}/api/v1/personas/${persona.id}/imports`,
      { method: "POST", headers, body: "{}" },
    );
    if (!impRes.ok) throw new Error(`import ${impRes.status}`);
    const imp = (await impRes.json()) as { id: string };

    const fileA = await uploadTxt(
      headers,
      persona.id,
      imp.id,
      "notes-a.txt",
      "Day one. Alice wrote this journal entry about the garden.\n",
    );
    const fileB = await uploadTxt(
      headers,
      persona.id,
      imp.id,
      "notes-b.txt",
      "Day two. A second independent note that must survive purge of A.\n",
    );

    await waitParsed(fileA);
    await waitParsed(fileB);
    console.log("ok both files parsed");

    const { db: db2, client: c2 } = createDb(process.env.DATABASE_URL!, {
      max: 1,
    });
    let chunksA = 0;
    let chunksB = 0;
    try {
      const [a] = await db2
        .select({ value: count() })
        .from(documentChunks)
        .where(eq(documentChunks.fileId, fileA));
      const [b] = await db2
        .select({ value: count() })
        .from(documentChunks)
        .where(eq(documentChunks.fileId, fileB));
      chunksA = Number(a?.value ?? 0);
      chunksB = Number(b?.value ?? 0);
    } finally {
      await c2.end({ timeout: 5 });
    }
    if (chunksA < 1 || chunksB < 1) {
      throw new Error(`expected chunks on both files, got A=${chunksA} B=${chunksB}`);
    }
    console.log(`ok chunks before purge A=${chunksA} B=${chunksB}`);

    const del = await fetch(
      `${API}/api/v1/personas/${persona.id}/files/${fileA}`,
      { method: "DELETE", headers },
    );
    if (!del.ok) throw new Error(`delete A ${del.status} ${await del.text()}`);
    const delBody = (await del.json()) as { status: string; chunksRemoved: number };
    if (delBody.status !== "deleted") {
      throw new Error(`expected deleted, got ${JSON.stringify(delBody)}`);
    }
    console.log(`ok purged A chunksRemoved=${delBody.chunksRemoved}`);

    const { db: db3, client: c3 } = createDb(process.env.DATABASE_URL!, {
      max: 1,
    });
    try {
      const fa = await db3.query.sourceFiles.findFirst({
        where: eq(sourceFiles.id, fileA),
      });
      const fb = await db3.query.sourceFiles.findFirst({
        where: eq(sourceFiles.id, fileB),
      });
      if (fa?.status !== "deleted") {
        throw new Error(`A status ${fa?.status}`);
      }
      if (fb?.status === "deleted" || fb?.status === "deleting") {
        throw new Error(`B should remain, got ${fb?.status}`);
      }
      const [aLeft] = await db3
        .select({ value: count() })
        .from(documentChunks)
        .where(eq(documentChunks.fileId, fileA));
      const [bLeft] = await db3
        .select({ value: count() })
        .from(documentChunks)
        .where(eq(documentChunks.fileId, fileB));
      if (Number(aLeft?.value ?? 0) !== 0) {
        throw new Error("A chunks still present after purge");
      }
      if (Number(bLeft?.value ?? 0) !== chunksB) {
        throw new Error(
          `B chunks changed: before ${chunksB} after ${bLeft?.value}`,
        );
      }
      const [other] = await db3
        .select({ value: count() })
        .from(documentChunks)
        .where(
          and(
            eq(documentChunks.personaId, persona.id),
            ne(documentChunks.fileId, fileB),
          ),
        );
      if (Number(other?.value ?? 0) !== 0) {
        throw new Error("unexpected leftover chunks for other files");
      }
    } finally {
      await c3.end({ timeout: 5 });
    }

    console.log("ok purge of A left B intact — check-purge passed");
  } finally {
    await worker.close();
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
