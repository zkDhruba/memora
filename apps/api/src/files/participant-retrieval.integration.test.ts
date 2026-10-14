/**
 * Flag test: after WhatsApp-style participant insert + subject mapping,
 * only the subject has retrievalAllowed=true; others stay false.
 */
import "../load-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDb,
  personaMemberships,
  personas,
  sourceFiles,
  sourceImports,
  sourceParticipants,
  subscriptions,
  users,
  type MemoraDb,
} from "@memora/db";
import { eq } from "drizzle-orm";
import { newId } from "../common/ids";
import type { AuditService } from "../auth/audit.service";
import { PersonaAccessService } from "../personas/persona-access.service";
import { FilesService } from "./files.service";

describe("Participant retrieval_allowed flag (2.7)", () => {
  let db: MemoraDb;
  let client: { end: (opts?: { timeout?: number }) => Promise<void> };
  let files: FilesService;

  const ownerId = newId();
  const personaId = newId();
  const importId = newId();
  const fileId = newId();
  const aliceId = newId();
  const bobId = newId();

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL required");
    }
    const bundle = createDb(process.env.DATABASE_URL, { max: 2 });
    db = bundle.db;
    client = bundle.client;

    const audit = {
      record: async () => undefined,
    } as unknown as AuditService;
    const access = new PersonaAccessService(db, audit);
    files = new FilesService(
      db,
      access,
      {} as never,
      {} as never,
      {} as never,
      audit,
      {
        chunkChatFile: async () => 0,
      } as never,
      {} as never,
    );

    await db.insert(users).values({
      id: ownerId,
      email: `ret-${ownerId.slice(0, 8)}@test.local`,
      passwordHash: "x",
      displayName: "Owner",
      emailVerifiedAt: new Date(),
    });
    await db.insert(subscriptions).values({
      userId: ownerId,
      planId: "free",
      status: "active",
    });
    await db.insert(personas).values({
      id: personaId,
      scenario: "living",
      status: "collecting",
      displayName: "Flag Test",
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
      originalFilename: "_chat.txt",
      mediaType: "text/plain",
      byteSize: 10,
      objectKey: `test/${fileId}`,
      bucket: "memora-clean",
      status: "needs_attention",
    });
    await db.insert(sourceParticipants).values([
      {
        id: aliceId,
        personaId,
        fileId,
        rawLabel: "Alice",
        role: "unknown",
        retrievalAllowed: false,
      },
      {
        id: bobId,
        personaId,
        fileId,
        rawLabel: "Bob",
        role: "unknown",
        retrievalAllowed: false,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(sourceParticipants).where(eq(sourceParticipants.fileId, fileId));
    await db.delete(sourceFiles).where(eq(sourceFiles.id, fileId));
    await db.delete(sourceImports).where(eq(sourceImports.id, importId));
    await db.delete(personaMemberships).where(eq(personaMemberships.personaId, personaId));
    await db.delete(personas).where(eq(personas.id, personaId));
    await db.delete(subscriptions).where(eq(subscriptions.userId, ownerId));
    await db.delete(users).where(eq(users.id, ownerId));
    await client.end({ timeout: 5 });
  });

  it("defaults unknown/other to not retrievable; subject becomes retrievable on map", async () => {
    const before = await files.listParticipants(ownerId, personaId, fileId);
    expect(before.data.every((p) => p.retrievalAllowed === false)).toBe(true);

    const mapped = await files.mapSubject(ownerId, personaId, fileId, {
      participantId: aliceId,
    });
    expect(mapped.subjectRetrievalAllowed).toBe(true);
    expect(mapped.othersRetrievalAllowed).toBe(false);

    const after = await files.listParticipants(ownerId, personaId, fileId);
    const byLabel = Object.fromEntries(
      after.data.map((p) => [p.rawLabel, p]),
    );
    expect(byLabel.Alice?.role).toBe("subject");
    expect(byLabel.Alice?.retrievalAllowed).toBe(true);
    expect(byLabel.Bob?.role).toBe("other");
    expect(byLabel.Bob?.retrievalAllowed).toBe(false);
  });
});
