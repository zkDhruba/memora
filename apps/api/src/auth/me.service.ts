import { Inject, Injectable } from "@nestjs/common";
import { subscriptions, type MemoraDb } from "@memora/db";
import { eq } from "drizzle-orm";
import { DB } from "../db/db.tokens";
import type { SessionUser } from "./session.service";

@Injectable()
export class MeService {
  constructor(@Inject(DB) private readonly db: MemoraDb) {}

  async getMe(user: SessionUser) {
    const sub = await this.db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, user.id),
      with: { plan: true },
    });

    const plan = sub?.plan
      ? {
          planId: sub.plan.id,
          displayName: sub.plan.displayName,
          limits: sub.plan.limits,
        }
      : null;

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerified: Boolean(user.emailVerifiedAt),
      platformRole: user.platformRole,
      plan,
    };
  }
}
