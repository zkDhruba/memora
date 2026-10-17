import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { PLAN_CATALOG } from "@memora/shared";
import { ApiException } from "../common/api-exception";
import { PlanGuardService } from "./plan-guard.service";

function guardFor(input: {
  used: string | null;
  maxPerDay: number | null;
  planId?: string;
}) {
  const base = PLAN_CATALOG.find((p) => p.id === (input.planId ?? "free"))!;
  const redis = {
    get: async () => input.used,
    incr: async () => Number(input.used ?? 0) + 1,
    expireat: async () => 1,
  };
  const db = {
    query: {
      subscriptions: {
        findFirst: async () => ({
          overrideMaxPersonas: null,
          plan: {
            id: base.id,
            displayName: base.displayName,
            limits: {
              ...base.limits,
              maxChatMessagesPerDay: input.maxPerDay,
            },
          },
        }),
      },
    },
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: async () => [{ value: 0 }],
        }),
      }),
    }),
  };
  return new PlanGuardService(db as never, redis as never);
}

describe("daily send quota (3.11)", () => {
  it("rejects the 26th Free send with PLAN_LIMIT_CHAT_DAY", async () => {
    const guard = guardFor({ used: "25", maxPerDay: 25, planId: "free" });
    await expect(guard.assertCanSendChatMessage("user-1")).rejects.toBeInstanceOf(
      ApiException,
    );
    try {
      await guard.assertCanSendChatMessage("user-1");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const body = (err as ApiException).getResponse() as {
        error: { code: string; details: { usedToday: number; maxChatMessagesPerDay: number } };
      };
      expect(body.error.code).toBe("PLAN_LIMIT_CHAT_DAY");
      expect(body.error.details.usedToday).toBe(25);
      expect(body.error.details.maxChatMessagesPerDay).toBe(25);
    }
  });

  it("allows Free send 25 when 24 were already used", async () => {
    const guard = guardFor({ used: "24", maxPerDay: 25, planId: "free" });
    const snap = await guard.assertCanSendChatMessage("user-1");
    expect(snap.chatMessagesUsedToday).toBe(24);
  });

  it("Pro+ unlimited skips the cap", async () => {
    const guard = guardFor({
      used: "10000",
      maxPerDay: null,
      planId: "pro_plus",
    });
    const snap = await guard.assertCanSendChatMessage("user-1");
    expect(snap.maxChatMessagesPerDay).toBeNull();
  });
});
