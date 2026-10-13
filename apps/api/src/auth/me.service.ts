import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { subscriptions, users, type MemoraDb } from "@memora/db";
import type { DeleteMeBody } from "@memora/shared";
import { eq } from "drizzle-orm";
import { ApiException } from "../common/api-exception";
import { DB } from "../db/db.tokens";
import { AuditService } from "./audit.service";
import { MfaService } from "./mfa.service";
import { PasswordService } from "./password.service";
import type { SessionUser } from "./session.service";
import { SessionService } from "./session.service";
import { StepUpService } from "./step-up.service";

@Injectable()
export class MeService {
  constructor(
    @Inject(DB) private readonly db: MemoraDb,
    private readonly mfa: MfaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly stepUp: StepUpService,
    private readonly audit: AuditService,
  ) {}

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

    const mfaEnabled = await this.mfa.hasConfirmedMfa(user.id);

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerified: Boolean(user.emailVerifiedAt),
      platformRole: user.platformRole,
      mfaEnabled,
      plan,
    };
  }

  /**
   * Account delete (step-up): password required; MFA code required when enabled.
   * Soft-disables the account and revokes sessions (full erasure job comes later).
   */
  async deleteAccount(
    user: SessionUser,
    sessionId: string,
    body: DeleteMeBody,
  ): Promise<void> {
    const full = await this.sessions.getUserById(user.id);
    if (!full) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
        "Authentication required.",
      );
    }

    const passwordOk = await this.passwords.verify(
      full.passwordHash,
      body.password,
    );
    if (!passwordOk) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "INVALID_CREDENTIALS",
        "Password is incorrect.",
      );
    }

    const mfaEnabled = await this.mfa.hasConfirmedMfa(user.id);
    if (mfaEnabled) {
      await this.mfa.verifyUserMfa(user.id, {
        totp: body.totp,
        recoveryCode: body.recoveryCode,
      });
    }

    await this.db
      .update(users)
      .set({ disabledAt: new Date() })
      .where(eq(users.id, user.id));

    await this.sessions.revokeAllForUser(user.id);
    await this.stepUp.clear(sessionId);

    await this.audit.record({
      actorUserId: user.id,
      action: "auth.account_delete_requested",
      targetType: "user",
      targetId: user.id,
      metadata: { mfa: mfaEnabled },
    });
  }
}
