import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  personaMemberships,
  personas,
  plans,
  subscriptions,
  type MemoraDb,
} from "@memora/db";
import type { PlanId, PlanLimits } from "@memora/shared";
import { and, count, eq } from "drizzle-orm";
import type Redis from "ioredis";
import { ApiException } from "../common/api-exception";
import { DB } from "../db/db.tokens";
import { REDIS } from "../redis/redis.tokens";

export type PlanSnapshot = {
  planId: PlanId;
  displayName: string;
  limits: PlanLimits;
  ownedPersonaCount: number;
  maxOwnedPersonas: number;
  maxChatMemoryMessages: number;
  maxChatMessagesPerDay: number | null;
  chatMessagesUsedToday: number;
  chatMessagesResetsAt: string;
  overLimit: boolean;
  canCreatePersona: boolean;
};

@Injectable()
export class PlanGuardService {
  constructor(
    @Inject(DB) private readonly db: MemoraDb,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async getSnapshot(userId: string): Promise<PlanSnapshot> {
    const sub = await this.loadSubscription(userId);
    const ownedPersonaCount = await this.countOwnedPersonas(userId);
    const maxOwnedPersonas = this.effectiveMaxPersonas(sub);
    const chatMessagesUsedToday = await this.getChatMessagesUsedToday(userId);

    return {
      planId: sub.plan.id,
      displayName: sub.plan.displayName,
      limits: sub.plan.limits,
      ownedPersonaCount,
      maxOwnedPersonas,
      maxChatMemoryMessages: sub.plan.limits.maxChatMemoryMessages,
      maxChatMessagesPerDay: sub.plan.limits.maxChatMessagesPerDay,
      chatMessagesUsedToday,
      chatMessagesResetsAt: this.nextUtcMidnight().toISOString(),
      // Downgrade case: owned more than current max.
      overLimit: ownedPersonaCount > maxOwnedPersonas,
      canCreatePersona: ownedPersonaCount < maxOwnedPersonas,
    };
  }

  /**
   * Throws 403 PLAN_LIMIT_PERSONAS when the user cannot create another owned persona.
   * Soft-deleted personas still count until hard purge (membership doc).
   */
  async assertCanCreatePersona(userId: string): Promise<PlanSnapshot> {
    const snapshot = await this.getSnapshot(userId);
    if (!snapshot.canCreatePersona) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        "PLAN_LIMIT_PERSONAS",
        "You have reached the persona limit for your plan.",
        {
          plan: snapshot.planId,
          maxOwnedPersonas: snapshot.maxOwnedPersonas,
          currentOwned: snapshot.ownedPersonaCount,
        },
      );
    }
    return snapshot;
  }

  /**
   * Throws 429 PLAN_LIMIT_CHAT_DAY when the daily send cap is reached.
   * Pro+ (null cap) always passes. Counter lives in Redis (UTC day).
   */
  async assertCanSendChatMessage(userId: string): Promise<PlanSnapshot> {
    const snapshot = await this.getSnapshot(userId);
    const max = snapshot.maxChatMessagesPerDay;
    if (max === null) return snapshot;

    if (snapshot.chatMessagesUsedToday >= max) {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        "PLAN_LIMIT_CHAT_DAY",
        "Daily chat send limit reached for your plan.",
        {
          plan: snapshot.planId,
          maxChatMessagesPerDay: max,
          usedToday: snapshot.chatMessagesUsedToday,
          resetsAt: snapshot.chatMessagesResetsAt,
        },
      );
    }
    return snapshot;
  }

  /** Call after a user chat message is accepted (Phase 3). */
  async recordChatSend(userId: string): Promise<number> {
    const key = this.chatSendKey(userId);
    const used = await this.redis.incr(key);
    if (used === 1) {
      await this.redis.expireat(key, Math.floor(this.nextUtcMidnight().getTime() / 1000));
    }
    return used;
  }

  async countOwnedPersonas(userId: string): Promise<number> {
    // Soft-deleted personas still count until purge removes rows.
    const [row] = await this.db
      .select({ value: count() })
      .from(personaMemberships)
      .innerJoin(personas, eq(personas.id, personaMemberships.personaId))
      .where(
        and(
          eq(personaMemberships.userId, userId),
          eq(personaMemberships.role, "owner"),
        ),
      );
    return Number(row?.value ?? 0);
  }

  async getChatMessagesUsedToday(userId: string): Promise<number> {
    const raw = await this.redis.get(this.chatSendKey(userId));
    return Number(raw ?? 0);
  }

  private async loadSubscription(userId: string) {
    const sub = await this.db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, userId),
      with: { plan: true },
    });

    if (!sub?.plan) {
      // Should not happen after register; fall back to seeded free plan.
      const free = await this.db.query.plans.findFirst({
        where: eq(plans.id, "free"),
      });
      if (!free) {
        throw new ApiException(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "PLAN_MISSING",
          "Plan catalog is not seeded.",
        );
      }
      return {
        plan: free,
        overrideMaxPersonas: null as number | null,
      };
    }

    return {
      plan: sub.plan,
      overrideMaxPersonas: sub.overrideMaxPersonas,
    };
  }

  private effectiveMaxPersonas(sub: {
    plan: { limits: PlanLimits };
    overrideMaxPersonas: number | null;
  }): number {
    if (sub.overrideMaxPersonas != null) return sub.overrideMaxPersonas;
    return sub.plan.limits.maxOwnedPersonas;
  }

  private chatSendKey(userId: string): string {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `chat_send:${userId}:${day}`;
  }

  private nextUtcMidnight(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
  }
}
