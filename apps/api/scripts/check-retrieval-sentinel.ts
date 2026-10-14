/**
 * 3.6 — Hybrid retrieval sentinel isolation (CLI smoke).
 *
 * Usage:
 *   pnpm --filter @memora/api exec tsx scripts/check-retrieval-sentinel.ts
 *
 * Prefer the vitest integration test for CI; this script is a manual happy path.
 */
import "../src/load-env";
import { randomUUID } from "node:crypto";
import {
  chunkEmbeddings,
  createDb,
  documentChunks,
  personaMemberships,
  personas,
  sourceFileVersions,
  sourceFiles,
  sourceImports,
  subscriptions,
  users,
} from "@memora/db";
import { sql } from "drizzle-orm";
import { newId } from "../src/common/ids";
import { env } from "../src/config/env";
import {
  FakeEmbeddingAdapter,
  hashTextToUnitVector,
} from "../src/embeddings/fake-embedding.adapter";
import { HybridRetrievalService } from "../src/retrieval/hybrid-retrieval.service";

const SENTINEL_A = "MEMORA_SENTINEL_ALPHA_cli_a1";
const SENTINEL_B = "MEMORA_SENTINEL_BETA_cli_b2";

async function main() {
  const { db, client } = createDb(process.env.DATABASE_URL!, { max: 2 });
  const consent = { assertCanCallProvider: async () => undefined };
  const retrieval = new HybridRetrievalService(
    db,
    new FakeEmbeddingAdapter(consent as never),
  );

  const ownerA = newId();
  const ownerB = newId();
  const personaA = newId();
  const personaB = newId();

  try {
    const run = randomUUID().slice(0, 8);
    let i = 0;
    for (const uid of [ownerA, ownerB]) {
      await db.insert(users).values({
        id: uid,
        email: `ret-${run}-${i++}@ret-check.test`,
        displayName: "Check",
        passwordHash: "x",
        emailVerifiedAt: new Date(),
      });
      await db.insert(subscriptions).values({
        userId: uid,
        planId: "free",
        status: "active",
      });
    }

    await seed(db, personaA, ownerA, SENTINEL_A);
    await seed(db, personaB, ownerB, SENTINEL_B);

    const hitA = await retrieval.retrieve(
      { personaId: personaA, actorUserId: ownerA, audience: "private" },
      SENTINEL_A,
    );
    const blobA = JSON.stringify(hitA);
    if (!blobA.includes(SENTINEL_A)) {
      throw new Error("expected sentinel A in persona A hits");
    }
    if (blobA.includes(SENTINEL_B)) {
      throw new Error("FAIL: persona B sentinel leaked into A");
    }
    console.log("ok persona A retrieve contains A, not B");

    const cross = await retrieval.retrieve(
      { personaId: personaA, actorUserId: ownerA, audience: "private" },
      SENTINEL_B,
    );
    if (JSON.stringify(cross).includes(SENTINEL_B)) {
      throw new Error("FAIL: querying B token under A returned B content");
    }
    console.log("ok cross-persona query does not leak B");

    console.log("ok hybrid retrieval sentinel isolation");
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function seed(
  db: ReturnType<typeof createDb>["db"],
  personaId: string,
  ownerId: string,
  sentinel: string,
) {
  const importId = newId();
  const fileId = newId();
  const versionId = newId();
  const chunkId = newId();
  const objectKey = `check-ret/${personaId}/${fileId}`;
  const content = `Isolation fixture ${sentinel} end.`;

  await db.insert(personas).values({
    id: personaId,
    scenario: "living",
    status: "collecting",
    displayName: `Ret ${sentinel.slice(-4)}`,
    languages: ["en"],
    createdByUserId: ownerId,
  });
  await db.insert(personaMemberships).values({
    id: newId(),
    personaId,
    userId: ownerId,
    role: "owner",
    audience: "private",
  });
  await db.insert(sourceImports).values({
    id: importId,
    personaId,
    createdByUserId: ownerId,
    status: "open",
    fileCount: 1,
  });
  await db.insert(sourceFiles).values({
    id: fileId,
    personaId,
    importId,
    uploadedByUserId: ownerId,
    originalFilename: "sentinel.txt",
    mediaType: "text/plain",
    byteSize: 32,
    objectKey,
    bucket: "memora-clean",
    status: "ready",
  });
  await db.insert(sourceFileVersions).values({
    id: versionId,
    fileId,
    generation: 1,
    objectKey,
    bucket: "memora-clean",
  });
  await db.insert(documentChunks).values({
    id: chunkId,
    personaId,
    fileId,
    fileVersionId: versionId,
    sourceKind: "journal",
    header: "journal",
    content,
    speakerRole: "document",
    audience: "private",
    retrievalAllowed: true,
    tokenCount: 16,
  });
  await db.execute(
    sql`update document_chunks set content_tsv = to_tsvector('simple', ${content}) where id = ${chunkId}::uuid`,
  );
  await db.insert(chunkEmbeddings).values({
    chunkId,
    model: env.embeddings.model(),
    dims: env.embeddings.dims(),
    embedding: hashTextToUnitVector(content, env.embeddings.dims()),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
