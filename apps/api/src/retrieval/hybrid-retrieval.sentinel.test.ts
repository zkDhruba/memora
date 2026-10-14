/**
 * 3.6 — Two personas with unique sentinel strings; retrieval never crosses.
 */
import "../load-env";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  chunkEmbeddings,
  createDb,
  documentChunks,
  memories,
  personaMemberships,
  personas,
  sourceFileVersions,
  sourceFiles,
  sourceImports,
  subscriptions,
  users,
  type MemoraDb,
} from "@memora/db";
import { sql } from "drizzle-orm";
import { newId } from "../common/ids";
import { env } from "../config/env";
import { FakeEmbeddingAdapter, hashTextToUnitVector } from "../embeddings/fake-embedding.adapter";
import { HybridRetrievalService } from "./hybrid-retrieval.service";
import type { PersonaScope } from "./persona-scope";

const SENTINEL_A = "MEMORA_SENTINEL_ALPHA_7f3a9b";
const SENTINEL_B = "MEMORA_SENTINEL_BETA_9c2e41";

describe("Hybrid retrieval sentinel isolation (3.6)", () => {
  let db: MemoraDb;
  let client: { end: (opts?: { timeout?: number }) => Promise<void> };
  let retrieval: HybridRetrievalService;

  const ownerA = newId();
  const ownerB = newId();
  const personaA = newId();
  const personaB = newId();
  const friendUser = newId();
  let privateChunkA = "";
  let friendChunkA = "";

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL required");
    }
    const bundle = createDb(process.env.DATABASE_URL, { max: 2 });
    db = bundle.db;
    client = bundle.client;

    const consent = {
      assertCanCallProvider: async () => undefined,
    };
    const embeddings = new FakeEmbeddingAdapter(consent as never);
    retrieval = new HybridRetrievalService(db, embeddings);

    const run = randomUUID().slice(0, 8);
    let i = 0;
    for (const uid of [ownerA, ownerB, friendUser]) {
      await db.insert(users).values({
        id: uid,
        email: `sent-${run}-${i++}@sentinel.test`,
        displayName: "Sentinel",
        passwordHash: "x",
        emailVerifiedAt: new Date(),
      });
      await db.insert(subscriptions).values({
        userId: uid,
        planId: "free",
        status: "active",
      });
    }

    await seedPersona(db, {
      personaId: personaA,
      ownerId: ownerA,
      name: "Persona Alpha",
      sentinel: SENTINEL_A,
      alsoFriendAudience: true,
    }).then((ids) => {
      privateChunkA = ids.privateChunkId;
      friendChunkA = ids.friendChunkId ?? "";
    });

    await seedPersona(db, {
      personaId: personaB,
      ownerId: ownerB,
      name: "Persona Beta",
      sentinel: SENTINEL_B,
    });

    await db.insert(personaMemberships).values({
      id: newId(),
      personaId: personaA,
      userId: friendUser,
      role: "participant",
      audience: "friend",
    });
  });

  afterAll(async () => {
    await client.end({ timeout: 5 });
  });

  it("never returns the other persona's sentinel", async () => {
    const scopeA: PersonaScope = {
      personaId: personaA,
      actorUserId: ownerA,
      audience: "private",
    };
    const scopeB: PersonaScope = {
      personaId: personaB,
      actorUserId: ownerB,
      audience: "private",
    };

    const hitA = await retrieval.retrieve(scopeA, SENTINEL_A);
    const blobA = JSON.stringify(hitA);
    expect(blobA).toContain(SENTINEL_A);
    expect(blobA).not.toContain(SENTINEL_B);

    const hitB = await retrieval.retrieve(scopeB, SENTINEL_B);
    const blobB = JSON.stringify(hitB);
    expect(blobB).toContain(SENTINEL_B);
    expect(blobB).not.toContain(SENTINEL_A);

    // Wrong-persona query still must not leak B into A
    const cross = await retrieval.retrieve(scopeA, SENTINEL_B);
    expect(JSON.stringify(cross)).not.toContain(SENTINEL_B);
  });

  it("audience filter hides private chunks from friend members", async () => {
    const friendScope: PersonaScope = {
      personaId: personaA,
      actorUserId: friendUser,
      audience: "friend",
    };
    const hits = await retrieval.searchChunks(friendScope, SENTINEL_A, 8);
    const ids = hits.map((h) => h.chunkId);
    expect(ids).not.toContain(privateChunkA);
    if (friendChunkA) {
      expect(ids).toContain(friendChunkA);
    }
  });

  it("confirmed bio memories are persona-scoped + audience-filtered", async () => {
    const memA = newId();
    const memPrivate = newId();
    await db.insert(memories).values([
      {
        id: memA,
        personaId: personaA,
        domain: "biographical",
        memoryType: "semantic",
        text: `Liked ${SENTINEL_A} tea`,
        status: "confirmed",
        knowledgeClass: "A",
        confidence: 1,
        audience: "any",
        origin: "owner_entered",
        sensitivity: "none",
      },
      {
        id: memPrivate,
        personaId: personaA,
        domain: "biographical",
        memoryType: "semantic",
        text: `Secret ${SENTINEL_A} vault`,
        status: "confirmed",
        knowledgeClass: "A",
        confidence: 1,
        audience: "private",
        origin: "owner_entered",
        sensitivity: "none",
      },
      {
        id: newId(),
        personaId: personaB,
        domain: "biographical",
        memoryType: "semantic",
        text: `Liked ${SENTINEL_B} coffee`,
        status: "confirmed",
        knowledgeClass: "A",
        confidence: 1,
        audience: "any",
        origin: "owner_entered",
        sensitivity: "none",
      },
    ]);

    const ownerHits = await retrieval.searchMemories(
      { personaId: personaA, actorUserId: ownerA, audience: "private" },
      SENTINEL_A,
      6,
    );
    expect(ownerHits.some((m) => m.memoryId === memA)).toBe(true);
    expect(ownerHits.some((m) => m.memoryId === memPrivate)).toBe(true);
    expect(JSON.stringify(ownerHits)).not.toContain(SENTINEL_B);

    const friendHits = await retrieval.searchMemories(
      { personaId: personaA, actorUserId: friendUser, audience: "friend" },
      SENTINEL_A,
      6,
    );
    expect(friendHits.some((m) => m.memoryId === memA)).toBe(true);
    expect(friendHits.some((m) => m.memoryId === memPrivate)).toBe(false);
  });
});

async function seedPersona(
  db: MemoraDb,
  input: {
    personaId: string;
    ownerId: string;
    name: string;
    sentinel: string;
    alsoFriendAudience?: boolean;
  },
) {
  const importId = newId();
  const fileId = newId();
  const versionId = newId();
  const privateChunkId = newId();
  const friendChunkId = input.alsoFriendAudience ? newId() : null;
  const model = env.embeddings.model();
  const dims = env.embeddings.dims();

  await db.insert(personas).values({
    id: input.personaId,
    scenario: "living",
    status: "collecting",
    displayName: input.name,
    alternateNames: [],
    languages: ["en"],
    createdByUserId: input.ownerId,
  });
  await db.insert(personaMemberships).values({
    id: newId(),
    personaId: input.personaId,
    userId: input.ownerId,
    role: "owner",
    audience: "private",
  });
  await db.insert(sourceImports).values({
    id: importId,
    personaId: input.personaId,
    createdByUserId: input.ownerId,
    status: "open",
    fileCount: 1,
  });
  const objectKey = `sentinel/${input.personaId}/${fileId}`;
  await db.insert(sourceFiles).values({
    id: fileId,
    importId,
    personaId: input.personaId,
    uploadedByUserId: input.ownerId,
    originalFilename: `${input.sentinel}.txt`,
    mediaType: "text/plain",
    byteSize: 64,
    sha256: createHash("sha256").update(input.sentinel).digest("hex"),
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

  const privateContent = `Journal note containing ${input.sentinel} for isolation.`;
  await insertChunkWithEmbedding(db, {
    id: privateChunkId,
    personaId: input.personaId,
    fileId,
    fileVersionId: versionId,
    content: privateContent,
    audience: "private",
    model,
    dims,
  });

  if (friendChunkId) {
    const friendContent = `Shared note with ${input.sentinel} visible to friends.`;
    await insertChunkWithEmbedding(db, {
      id: friendChunkId,
      personaId: input.personaId,
      fileId,
      fileVersionId: versionId,
      content: friendContent,
      audience: "friend",
      model,
      dims,
    });
  }

  return { privateChunkId, friendChunkId };
}

async function insertChunkWithEmbedding(
  db: MemoraDb,
  input: {
    id: string;
    personaId: string;
    fileId: string;
    fileVersionId: string;
    content: string;
    audience: "private" | "friend";
    model: string;
    dims: number;
  },
) {
  await db.insert(documentChunks).values({
    id: input.id,
    personaId: input.personaId,
    fileId: input.fileId,
    fileVersionId: input.fileVersionId,
    sourceKind: "journal",
    header: "journal",
    content: input.content,
    speakerRole: "document",
    audience: input.audience,
    retrievalAllowed: true,
    tokenCount: 24,
  });
  await db.execute(
    sql`update document_chunks set content_tsv = to_tsvector('simple', ${input.content}) where id = ${input.id}::uuid`,
  );
  const vector = hashTextToUnitVector(input.content, input.dims);
  await db.insert(chunkEmbeddings).values({
    chunkId: input.id,
    model: input.model,
    dims: input.dims,
    embedding: vector,
  });
}
