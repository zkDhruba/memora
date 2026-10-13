import "../load-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDb,
  subscriptions,
  users,
  type MemoraDb,
} from "@memora/db";
import { eq } from "drizzle-orm";
import { newId } from "../common/ids";
import { AuditService } from "./audit.service";
import { PlanAssignService } from "../plans/plan-assign.service";

describe("Audit log (integration)", () => {
  let db: MemoraDb;
  let client: { end: (opts?: { timeout?: number }) => Promise<void> };
  let audit: AuditService;
  let plans: PlanAssignService;

  const userId = newId();
  const otherId = newId();

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL required for integration tests");
    }
    const bundle = createDb(process.env.DATABASE_URL, { max: 2 });
    db = bundle.db;
    client = bundle.client;
    audit = new AuditService(db);
    plans = new PlanAssignService(db, audit);

    await db.insert(users).values([
      {
        id: userId,
        email: `audit-${userId.slice(0, 8)}@test.local`,
        passwordHash: "x",
        displayName: "Audit User",
        emailVerifiedAt: new Date(),
      },
      {
        id: otherId,
        email: `audit-other-${otherId.slice(0, 8)}@test.local`,
        passwordHash: "x",
        displayName: "Other",
        emailVerifiedAt: new Date(),
      },
    ]);
    await db.insert(subscriptions).values([
      { userId, planId: "free", status: "active" },
      { userId: otherId, planId: "free", status: "active" },
    ]);
  }, 60_000);

  afterAll(async () => {
    try {
      // Leave audit rows (append-only); clean users/subs only.
      for (const id of [userId, otherId]) {
        await db.delete(subscriptions).where(eq(subscriptions.userId, id));
        await db.delete(users).where(eq(users.id, id));
      }
    } catch {
      // ignore
    }
    await client?.end({ timeout: 5 });
  });

  it("records auth and consent-style events visible to the actor", async () => {
    await audit.record({
      actorUserId: userId,
      action: "auth.login",
      targetType: "session",
      targetId: newId(),
    });
    await audit.record({
      actorUserId: userId,
      personaId: newId(),
      action: "consent.grant",
      targetType: "consent",
      targetId: newId(),
      metadata: { purpose: "converse" },
    });
    // Other user's event must not appear.
    await audit.record({
      actorUserId: otherId,
      action: "auth.login",
      targetType: "session",
      targetId: newId(),
    });

    const mine = await audit.listForActor(userId, { limit: 20 });
    expect(mine.some((r) => r.action === "auth.login")).toBe(true);
    expect(mine.some((r) => r.action === "consent.grant")).toBe(true);

    const other = await audit.listForActor(otherId, { limit: 20 });
    expect(other.some((r) => r.action === "consent.grant")).toBe(false);
    expect(other.some((r) => r.action === "auth.login")).toBe(true);
  });

  it("plan.change is audited and listed for the actor", async () => {
    const result = await plans.assignPlan({
      userId,
      planId: "pro",
      actorUserId: userId,
      reason: "test",
    });
    expect(result).toEqual({ from: "free", to: "pro" });

    const mine = await audit.listForActor(userId, { limit: 50 });
    const change = mine.find((r) => r.action === "plan.change");
    expect(change).toBeTruthy();
    expect(change?.metadata).toMatchObject({
      from: "free",
      to: "pro",
      reason: "test",
    });

    // Revert for cleanup friendliness
    await plans.assignPlan({
      userId,
      planId: "free",
      actorUserId: userId,
      reason: "test-revert",
    });
  });
});
