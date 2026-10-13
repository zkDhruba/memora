import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { plans, subscriptions, type MemoraDb } from "@memora/db";
import type { PlanId } from "@memora/shared";
import { eq } from "drizzle-orm";
import { ApiException } from "../common/api-exception";
import { AuditService } from "../auth/audit.service";
import { DB } from "../db/db.tokens";

/**
 * Assign / change a user's subscription plan and write `plan.change` audit.
 * Full admin UI is Phase 6; this is the shared write path for scripts and later admin.
 */
@Injectable()
export class PlanAssignService {
  constructor(
    @Inject(DB) private readonly db: MemoraDb,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async assignPlan(input: {
    userId: string;
    planId: PlanId;
    actorUserId: string;
    reason?: string;
  }): Promise<{ from: PlanId | null; to: PlanId }> {
    const plan = await this.db.query.plans.findFirst({
      where: eq(plans.id, input.planId),
    });
    if (!plan || !plan.active) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "PLAN_NOT_FOUND",
        "Unknown or inactive plan.",
      );
    }

    const existing = await this.db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, input.userId),
    });
    const from = (existing?.planId as PlanId | undefined) ?? null;

    if (existing?.planId === input.planId) {
      return { from, to: input.planId };
    }

    await this.db.transaction(async (tx) => {
      if (existing) {
        await tx
          .update(subscriptions)
          .set({ planId: input.planId, status: "active" })
          .where(eq(subscriptions.userId, input.userId));
      } else {
        await tx.insert(subscriptions).values({
          userId: input.userId,
          planId: input.planId,
          status: "active",
        });
      }
    });

    await this.audit.record({
      actorUserId: input.actorUserId,
      action: "plan.change",
      targetType: "user",
      targetId: input.userId,
      metadata: {
        from,
        to: input.planId,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    });

    return { from, to: input.planId };
  }
}
