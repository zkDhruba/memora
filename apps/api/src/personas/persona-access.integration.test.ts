import "../load-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpException, HttpStatus } from "@nestjs/common";
import {
  createDb,
  personaMemberships,
  personas,
  subscriptions,
  users,
  type MemoraDb,
} from "@memora/db";
import { eq } from "drizzle-orm";
import { newId } from "../common/ids";
import type { AuditService } from "../auth/audit.service";
import type { PlanGuardService } from "../plans/plan-guard.service";
import { PersonaAccessService } from "./persona-access.service";
import { PersonasService } from "./personas.service";

function errCode(err: unknown): string | undefined {
  if (err instanceof HttpException) {
    const body = err.getResponse() as { error?: { code?: string } };
    return body.error?.code;
  }
  return undefined;
}

describe("Persona membership access (integration)", () => {
  let db: MemoraDb;
  let client: { end: (opts?: { timeout?: number }) => Promise<void> };
  let access: PersonaAccessService;
  let personasService: PersonasService;

  const ownerId = newId();
  const strangerId = newId();
  const participantId = newId();
  const personaId = newId();

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL required for integration tests");
    }

    const bundle = createDb(process.env.DATABASE_URL, { max: 2 });
    db = bundle.db;
    client = bundle.client;

    access = new PersonaAccessService(db);
    const audit = {
      record: async () => undefined,
    } as unknown as AuditService;
    const planGuard = {} as PlanGuardService;
    personasService = new PersonasService(db, planGuard, audit, access);

    await db.insert(users).values([
      {
        id: ownerId,
        email: `owner-${ownerId.slice(0, 8)}@test.local`,
        passwordHash: "x",
        displayName: "Owner",
        emailVerifiedAt: new Date(),
      },
      {
        id: strangerId,
        email: `stranger-${strangerId.slice(0, 8)}@test.local`,
        passwordHash: "x",
        displayName: "Stranger",
        emailVerifiedAt: new Date(),
      },
      {
        id: participantId,
        email: `part-${participantId.slice(0, 8)}@test.local`,
        passwordHash: "x",
        displayName: "Participant",
        emailVerifiedAt: new Date(),
      },
    ]);

    await db.insert(subscriptions).values([
      { userId: ownerId, planId: "free", status: "active" },
      { userId: strangerId, planId: "free", status: "active" },
      { userId: participantId, planId: "free", status: "active" },
    ]);

    await db.insert(personas).values({
      id: personaId,
      scenario: "living",
      status: "collecting",
      displayName: "Access Test Persona",
      languages: ["en"],
      createdByUserId: ownerId,
    });

    await db.insert(personaMemberships).values([
      {
        id: newId(),
        personaId,
        userId: ownerId,
        role: "owner",
        audience: "private",
      },
      {
        id: newId(),
        personaId,
        userId: participantId,
        role: "participant",
        audience: "friend",
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    try {
      await db
        .delete(personaMemberships)
        .where(eq(personaMemberships.personaId, personaId));
      await db.delete(personas).where(eq(personas.id, personaId));
      for (const id of [ownerId, strangerId, participantId]) {
        await db.delete(subscriptions).where(eq(subscriptions.userId, id));
        await db.delete(users).where(eq(users.id, id));
      }
    } catch {
      // ignore cleanup errors
    }
    await client?.end({ timeout: 5 });
  });

  it("owner can requireMember", async () => {
    const result = await access.requireMember(ownerId, personaId);
    expect(result.membership.role).toBe("owner");
    expect(result.persona.displayName).toBe("Access Test Persona");
  });

  it("stranger gets PERSONA_NOT_FOUND (404) on requireMember", async () => {
    try {
      await access.requireMember(strangerId, personaId);
      expect.unreachable("expected 404");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(errCode(err)).toBe("PERSONA_NOT_FOUND");
    }
  });

  it("stranger getOne returns 404", async () => {
    try {
      await personasService.getOne(strangerId, personaId);
      expect.unreachable("expected 404");
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(errCode(err)).toBe("PERSONA_NOT_FOUND");
    }
  });

  it("stranger cannot list the persona in their dashboard", async () => {
    const list = await personasService.listForUser(strangerId);
    expect(list.find((p) => p.id === personaId)).toBeUndefined();
  });

  it("stranger PATCH/DELETE/consents are 404 (no existence leak)", async () => {
    const cases = [
      () =>
        personasService.update(strangerId, personaId, {
          biography: "nope",
        }),
      () => personasService.softDelete(strangerId, personaId),
      () => personasService.listConsents(strangerId, personaId),
      () =>
        personasService.grantConsent(strangerId, personaId, {
          purpose: "converse",
          statementVersion: "t",
        }),
    ];

    for (const run of cases) {
      try {
        await run();
        expect.unreachable("expected 404");
      } catch (err) {
        expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect(errCode(err)).toBe("PERSONA_NOT_FOUND");
      }
    }
  });

  it("participant can read but gets 403 on owner-only actions", async () => {
    const one = await personasService.getOne(participantId, personaId);
    expect(one.role).toBe("participant");

    try {
      await personasService.softDelete(participantId, personaId);
      expect.unreachable("expected 403");
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(errCode(err)).toBe("PERSONA_FORBIDDEN");
    }

    try {
      await personasService.listConsents(participantId, personaId);
      expect.unreachable("expected 403");
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(errCode(err)).toBe("PERSONA_FORBIDDEN");
    }
  });

  it("unknown persona id is 404 for everyone", async () => {
    const fake = newId();
    try {
      await access.requireMember(ownerId, fake);
      expect.unreachable("expected 404");
    } catch (err) {
      expect(errCode(err)).toBe("PERSONA_NOT_FOUND");
    }
  });
});
