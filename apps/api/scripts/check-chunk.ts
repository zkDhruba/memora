/**
 * Upload plain text → parse → document_chunks rows.
 *
 * Usage (API on :4000; script boots its own worker):
 *   pnpm --filter @memora/api exec tsx scripts/check-chunk.ts
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
import { eq } from "drizzle-orm";
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

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const worker = startIngestionWorker(app.get(IngestionProcessor));

  try {
    const suffix = randomUUID().slice(0, 8);
    const password = "TestPass123!";
    const email = `chunk-${suffix}@test.local`;

    const reg = await fetch(`${API}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Chunk" }),
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

    const create = await fetch(`${API}/api/v1/personas`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: jar.cookie },
      body: JSON.stringify({
        scenario: "living",
        displayName: `Chunk ${suffix}`,
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
    if (!create.ok) throw new Error(`persona ${create.status}`);
    const personaId = ((await create.json()) as { id: string }).id;

    const body = Buffer.from(
      [
        "Paragraph one about the garden and the long summer evenings.",
        "",
        "Paragraph two continues the story with enough words to matter.",
        "",
        "Paragraph three wraps up the note for the chunker smoke test.",
      ].join("\n"),
      "utf8",
    );
    const sha256 = createHash("sha256").update(body).digest("hex");
    const headers = {
      "Content-Type": "application/json",
      Cookie: jar.cookie,
    };

    const imp = (await (
      await fetch(`${API}/api/v1/personas/${personaId}/imports`, {
        method: "POST",
        headers,
        body: "{}",
      })
    ).json()) as { id: string };

    const pre = (await (
      await fetch(`${API}/api/v1/personas/${personaId}/files/presign`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          importId: imp.id,
          filename: "note.txt",
          mediaType: "text/plain",
          byteSize: body.length,
        }),
      })
    ).json()) as {
      fileId: string;
      url: string;
      headers: Record<string, string>;
    };

    await fetch(pre.url, { method: "PUT", headers: pre.headers, body });
    const done = await fetch(
      `${API}/api/v1/personas/${personaId}/files/${pre.fileId}/complete`,
      { method: "POST", headers, body: JSON.stringify({ sha256 }) },
    );
    if (!done.ok) throw new Error(`complete ${done.status}`);

    const start = Date.now();
    let chunkCount = 0;
    while (Date.now() - start < 45_000) {
      const { db: d2, client: c2 } = createDb(process.env.DATABASE_URL!, {
        max: 1,
      });
      try {
        const file = await d2.query.sourceFiles.findFirst({
          where: eq(sourceFiles.id, pre.fileId),
        });
        if (file?.status === "parsed") {
          const chunks = await d2.query.documentChunks.findMany({
            where: eq(documentChunks.fileId, pre.fileId),
          });
          chunkCount = chunks.length;
          if (chunkCount < 1) throw new Error("parsed but no chunks");
          if (chunks.some((c) => !c.retrievalAllowed)) {
            throw new Error("document chunks should be retrieval_allowed");
          }
          if (chunks.some((c) => c.speakerRole !== "document")) {
            throw new Error("expected speaker_role=document");
          }
          console.log("ok document chunks", chunkCount, "kind", chunks[0]?.sourceKind);
          console.log("chunk check passed");
          return;
        }
      } finally {
        await c2.end({ timeout: 5 });
      }
      await sleep(250);
    }
    throw new Error("timeout waiting for chunks");
  } finally {
    await worker.close();
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
