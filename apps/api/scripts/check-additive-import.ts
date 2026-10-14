/**
 * 2.11 — Second import is additive: file A’s chunks remain after file B lands;
 * persona chunk count is the sum; exact duplicate SHA-256 is rejected.
 *
 * Usage (API up; script boots its own worker):
 *   pnpm --filter @memora/api exec tsx scripts/check-additive-import.ts
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
import { count, eq, inArray } from "drizzle-orm";
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
): Promise<{ fileId: string; status: number; errorCode?: string }> {
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
  const text = await done.text();
  let errorCode: string | undefined;
  try {
    errorCode = (JSON.parse(text) as { error?: { code?: string } }).error?.code;
  } catch {
    /* ignore */
  }
  return { fileId: signed.fileId, status: done.status, errorCode };
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
      await sleep(400);
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
    const email = `add-${suffix}@test.local`;
    const password = "TestPass123!";
    const markerA = `ADDITIVE_MARKER_A_${suffix}`;
    const markerB = `ADDITIVE_MARKER_B_${suffix}`;
    const bodyA = `Date: 2024-01-10T09:00:00Z\n\nFirst import journal. ${markerA} loved quiet tea.\n`;
    const bodyB = `Date: 2024-02-20T18:00:00Z\n\nSecond import journal. ${markerB} walked the river.\n`;

    const reg = await fetch(`${API}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Additive" }),
    });
    if (!reg.ok) throw new Error(`register ${reg.status}`);
    const { userId } = (await reg.json()) as { userId: string };

    {
      const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
      try {
        await db
          .update(users)
          .set({ emailVerifiedAt: new Date() })
          .where(eq(users.id, userId));
      } finally {
        await client.end({ timeout: 5 });
      }
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
        displayName: `Additive ${suffix}`,
        languages: ["en"],
        attestation: { kind: "self", statement: "I am the subject." },
        consents: [
          { purpose: "host_records", statementVersion: "v1" },
          { purpose: "converse", statementVersion: "v1" },
        ],
      }),
    });
    if (!create.ok) throw new Error(`persona ${create.status}`);
    const persona = (await create.json()) as { id: string };

    // --- Import 1: file A ---
    const imp1Res = await fetch(
      `${API}/api/v1/personas/${persona.id}/imports`,
      { method: "POST", headers, body: "{}" },
    );
    if (!imp1Res.ok) throw new Error(`import1 ${imp1Res.status}`);
    const imp1 = (await imp1Res.json()) as { id: string };

    const upA = await uploadTxt(
      headers,
      persona.id,
      imp1.id,
      "journal-a.txt",
      bodyA,
    );
    if (upA.status !== 200 && upA.status !== 201) {
      throw new Error(`upload A ${upA.status} ${upA.errorCode}`);
    }
    await waitParsed(upA.fileId);
    console.log("ok import 1 file A parsed");

    let snapshotA: Array<{ id: string; content: string }>;
    let countA = 0;
    {
      const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
      try {
        const rows = await db.query.documentChunks.findMany({
          where: eq(documentChunks.fileId, upA.fileId),
        });
        snapshotA = rows.map((r) => ({ id: r.id, content: r.content }));
        countA = rows.length;
        if (countA < 1) throw new Error("file A produced zero chunks");
        if (!rows.some((r) => r.content.includes(markerA))) {
          throw new Error("file A marker missing from chunks");
        }
      } finally {
        await client.end({ timeout: 5 });
      }
    }
    console.log(`ok snapshot A chunks=${countA}`);

    // --- Import 2: file B (separate import) ---
    const imp2Res = await fetch(
      `${API}/api/v1/personas/${persona.id}/imports`,
      { method: "POST", headers, body: "{}" },
    );
    if (!imp2Res.ok) throw new Error(`import2 ${imp2Res.status}`);
    const imp2 = (await imp2Res.json()) as { id: string };

    const upB = await uploadTxt(
      headers,
      persona.id,
      imp2.id,
      "journal-b.txt",
      bodyB,
    );
    if (upB.status !== 200 && upB.status !== 201) {
      throw new Error(`upload B ${upB.status} ${upB.errorCode}`);
    }
    await waitParsed(upB.fileId);
    console.log("ok import 2 file B parsed");

    {
      const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
      try {
        const afterA = await db.query.documentChunks.findMany({
          where: eq(documentChunks.fileId, upA.fileId),
        });
        if (afterA.length !== countA) {
          throw new Error(
            `A chunk count changed after B: was ${countA}, now ${afterA.length}`,
          );
        }
        const byId = new Map(afterA.map((r) => [r.id, r.content]));
        for (const prev of snapshotA) {
          if (byId.get(prev.id) !== prev.content) {
            throw new Error(`A chunk ${prev.id} content changed after B import`);
          }
        }
        if (!afterA.some((r) => r.content.includes(markerA))) {
          throw new Error("A marker lost after second import");
        }

        const bRows = await db.query.documentChunks.findMany({
          where: eq(documentChunks.fileId, upB.fileId),
        });
        if (bRows.length < 1) throw new Error("file B produced zero chunks");
        if (!bRows.some((r) => r.content.includes(markerB))) {
          throw new Error("file B marker missing from chunks");
        }

        const [personaTotal] = await db
          .select({ value: count() })
          .from(documentChunks)
          .where(eq(documentChunks.personaId, persona.id));
        const expected = countA + bRows.length;
        if (Number(personaTotal?.value ?? 0) !== expected) {
          throw new Error(
            `persona chunk sum expected ${expected}, got ${personaTotal?.value}`,
          );
        }

        // Both imports still listed as non-deleted.
        const files = await db.query.sourceFiles.findMany({
          where: inArray(sourceFiles.id, [upA.fileId, upB.fileId]),
        });
        if (files.length !== 2) throw new Error("expected both files present");
        if (files.some((f) => f.status === "deleted" || f.status === "deleting")) {
          throw new Error("a file was deleted during additive import");
        }
        if (new Set(files.map((f) => f.importId)).size !== 2) {
          throw new Error("expected two distinct import ids");
        }

        console.log(
          `ok additive: A intact (${countA}) + B (${bRows.length}) = ${expected}`,
        );
      } finally {
        await client.end({ timeout: 5 });
      }
    }

    // Exact duplicate of A body into import 2 → FILE_DUPLICATE
    const dup = await uploadTxt(
      headers,
      persona.id,
      imp2.id,
      "journal-a-dup.txt",
      bodyA,
    );
    if (dup.status !== 409 || dup.errorCode !== "FILE_DUPLICATE") {
      throw new Error(
        `expected 409 FILE_DUPLICATE, got ${dup.status} ${dup.errorCode}`,
      );
    }
    console.log("ok duplicate SHA-256 rejected (FILE_DUPLICATE)");
    console.log("ok additive second-import check passed");
  } finally {
    await worker.close().catch(() => undefined);
    await app.close().catch(() => undefined);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
