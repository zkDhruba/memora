/**
 * 3.2 — Embed two journal chunks via OpenRouter, then ORDER BY cosine distance.
 *
 * Usage:
 *   pnpm db:migrate
 *   pnpm --filter @memora/api exec tsx scripts/check-embeddings.ts
 */
import "../src/load-env";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import {
  chunkEmbeddings,
  createDb,
  documentChunks,
  sourceFileVersions,
  users,
} from "@memora/db";
import { count, eq } from "drizzle-orm";
import { AppModule } from "../src/app.module";
import { env } from "../src/config/env";
import { ChunkEmbeddingService } from "../src/embeddings/chunk-embedding.service";
import { newId } from "../src/common/ids";
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

async function main() {
  if (!env.openrouter.apiKey()) {
    console.error("FAIL: OPENROUTER_API_KEY required");
    process.exit(2);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const embedder = app.get(ChunkEmbeddingService);
  const worker = startIngestionWorker(app.get(IngestionProcessor));

  try {
    const suffix = randomUUID().slice(0, 8);
    const email = `emb-${suffix}@test.local`;
    const password = "TestPass123!";

    const reg = await fetch(`${API}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Emb" }),
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
        displayName: `Emb ${suffix}`,
        languages: ["en"],
        providerKey: "openrouter",
        attestation: { kind: "self", statement: "I am the subject." },
        consents: [
          { purpose: "host_records", statementVersion: "v1" },
          { purpose: "converse", statementVersion: "v1" },
          {
            purpose: "send_to_provider",
            providerKey: "openrouter",
            statementVersion: "v1",
          },
        ],
      }),
    });
    if (!create.ok) {
      throw new Error(`persona ${create.status} ${await create.text()}`);
    }
    const persona = (await create.json()) as { id: string };

    // Minimal import + file + version so chunks satisfy FKs
    const impRes = await fetch(
      `${API}/api/v1/personas/${persona.id}/imports`,
      { method: "POST", headers, body: "{}" },
    );
    if (!impRes.ok) throw new Error(`import ${impRes.status}`);
    const imp = (await impRes.json()) as { id: string };

    const noteA = `Date: 2024-05-01\n\nShe collected blue ceramic teacups from Kyoto.\n`;
    const noteB = `Date: 2024-06-01\n\nHe repaired bicycle chains in the alley workshop.\n`;

    // Upload two short texts via normal pipeline so we get real files/versions/chunks
    async function upload(name: string, body: string) {
      const { createHash } = await import("node:crypto");
      const bytes = Buffer.from(body, "utf8");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const pre = await fetch(
        `${API}/api/v1/personas/${persona.id}/files/presign`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            importId: imp.id,
            filename: name,
            mediaType: "text/plain",
            byteSize: bytes.length,
          }),
        },
      );
      if (!pre.ok) throw new Error(`presign ${pre.status}`);
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
        `${API}/api/v1/personas/${persona.id}/files/${signed.fileId}/complete`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ sha256 }),
        },
      );
      if (!done.ok) throw new Error(`complete ${done.status}`);
      return signed.fileId;
    }

    const fileA = await upload("tea.txt", noteA);
    const fileB = await upload("bike.txt", noteB);

    // Wait for parse/chunk (worker may already be running; also start via Nest not needed)
    const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
    try {
      const start = Date.now();
      let ready = false;
      while (Date.now() - start < 90_000) {
        const [n] = await db
          .select({ value: count() })
          .from(documentChunks)
          .where(eq(documentChunks.personaId, persona.id));
        if (Number(n?.value ?? 0) >= 2) {
          ready = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!ready) {
        console.log("warn: worker slow — inserting synthetic chunks");
        for (const [content, fileId] of [
          [noteA, fileA],
          [noteB, fileB],
        ] as const) {
          const version = await db.query.sourceFileVersions.findFirst({
            where: eq(sourceFileVersions.fileId, fileId),
          });
          if (!version) throw new Error(`no version for ${fileId}`);
          await db.insert(documentChunks).values({
            id: newId(),
            personaId: persona.id,
            fileId,
            fileVersionId: version.id,
            sourceKind: "journal",
            header: "journal",
            content,
            speakerRole: "document",
            retrievalAllowed: true,
            tokenCount: 20,
          });
        }
      }
    } finally {
      await client.end({ timeout: 5 });
    }

    const { embedded, model } = await embedder.embedPersonaChunks(persona.id, {
      limit: 16,
    });
    if (embedded < 1) throw new Error(`expected embeddings, got ${embedded}`);
    console.log(`ok embedded ${embedded} chunks model=${model}`);

    {
      const { db: db2, client: c2 } = createDb(process.env.DATABASE_URL!, {
        max: 1,
      });
      try {
        const [n] = await db2
          .select({ value: count() })
          .from(chunkEmbeddings);
        if (Number(n?.value ?? 0) < 1) throw new Error("no chunk_embeddings rows");
      } finally {
        await c2.end({ timeout: 5 });
      }
    }

    const hits = await embedder.nearestByText({
      personaId: persona.id,
      query: "ceramic teacups from Japan",
      limit: 2,
    });
    if (hits.length < 1) throw new Error("nearest returned empty");
    const top = hits[0]!;
    if (!top.content.toLowerCase().includes("teacup")) {
      throw new Error(
        `expected tea chunk first, got: ${top.content.slice(0, 80)} dist=${top.distance}`,
      );
    }
    console.log(
      JSON.stringify({
        ok: true,
        topPreview: top.content.slice(0, 60),
        distance: top.distance,
        second: hits[1]?.content.slice(0, 40),
      }),
    );
    console.log("ok cosine order — tea closer than bike — check-embeddings passed");
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
