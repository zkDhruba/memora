import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  subscriptions,
  users,
  type MemoraDb,
} from "@memora/db";
import type {
  ForgotPasswordBody,
  LoginBody,
  RegisterBody,
  ResetPasswordBody,
  VerifyEmailBody,
} from "@memora/shared";
import { eq } from "drizzle-orm";
import { ApiException } from "../common/api-exception";
import { newId } from "../common/ids";
import { DB } from "../db/db.tokens";
import { MailService } from "../mail/mail.service";
import { AuthTokensService } from "./auth-tokens.service";
import { AuditService } from "./audit.service";
import { MfaService } from "./mfa.service";
import { PasswordService } from "./password.service";
import { SessionService } from "./session.service";

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: MemoraDb,
    private readonly passwords: PasswordService,
    private readonly tokens: AuthTokensService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly mfa: MfaService,
  ) {}

  async register(body: RegisterBody): Promise<{ userId: string }> {
    const email = body.email.trim().toLowerCase();
    const existing = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (existing) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        "EMAIL_IN_USE",
        "An account with this email already exists.",
      );
    }

    const userId = newId();
    const passwordHash = await this.passwords.hash(body.password);

    await this.db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: userId,
        email,
        passwordHash,
        displayName: body.displayName.trim(),
      });
      await tx.insert(subscriptions).values({
        userId,
        planId: "free",
        status: "active",
      });
    });

    const token = await this.tokens.issueVerifyToken(userId);
    await this.mail.sendVerificationEmail(email, token);
    await this.audit.record({
      actorUserId: userId,
      action: "auth.register",
      targetType: "user",
      targetId: userId,
    });

    return { userId };
  }

  async verifyEmail(body: VerifyEmailBody): Promise<{ verified: true }> {
    const userId = await this.tokens.consumeVerifyToken(body.token);
    if (!userId) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_TOKEN",
        "Verification token is invalid or expired.",
      );
    }

    const user = await this.sessions.getUserById(userId);
    if (!user) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_TOKEN",
        "Verification token is invalid or expired.",
      );
    }

    if (!user.emailVerifiedAt) {
      await this.db
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.id, userId));
      await this.audit.record({
        actorUserId: userId,
        action: "auth.verify_email",
        targetType: "user",
        targetId: userId,
      });
    }

    return { verified: true };
  }

  async login(
    body: LoginBody,
    meta: { userAgent?: string; ip?: string },
  ): Promise<{ rawToken: string; expiresAt: Date; userId: string }> {
    const email = body.email.trim().toLowerCase();

    if (await this.tokens.isLoginLocked(email)) {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        "LOGIN_LOCKED",
        "Too many failed login attempts. Try again later.",
      );
    }

    const user = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    const invalid = () =>
      new ApiException(
        HttpStatus.UNAUTHORIZED,
        "INVALID_CREDENTIALS",
        "Email or password is incorrect.",
      );

    if (!user || user.disabledAt) {
      await this.tokens.recordLoginFailure(email);
      await this.audit.record({
        action: "auth.login_failed",
        metadata: { email, reason: "unknown_or_disabled" },
      });
      throw invalid();
    }

    const ok = await this.passwords.verify(user.passwordHash, body.password);
    if (!ok) {
      await this.tokens.recordLoginFailure(email);
      await this.audit.record({
        actorUserId: user.id,
        action: "auth.login_failed",
        targetType: "user",
        targetId: user.id,
        metadata: { reason: "bad_password" },
      });
      throw invalid();
    }

    if (await this.mfa.hasConfirmedMfa(user.id)) {
      if (!body.totp && !body.recoveryCode) {
        throw new ApiException(
          HttpStatus.UNAUTHORIZED,
          "MFA_REQUIRED",
          "Authenticator or recovery code is required.",
        );
      }
      try {
        await this.mfa.verifyUserMfa(user.id, {
          totp: body.totp,
          recoveryCode: body.recoveryCode,
        });
      } catch (err) {
        await this.tokens.recordLoginFailure(email);
        await this.audit.record({
          actorUserId: user.id,
          action: "auth.login_failed",
          targetType: "user",
          targetId: user.id,
          metadata: { reason: "bad_mfa" },
        });
        throw err;
      }
    }

    await this.tokens.clearLoginFailures(email);
    const session = await this.sessions.createSession({
      userId: user.id,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });

    await this.audit.record({
      actorUserId: user.id,
      action: "auth.login",
      targetType: "session",
      targetId: session.sessionId,
    });

    return {
      rawToken: session.rawToken,
      expiresAt: session.expiresAt,
      userId: user.id,
    };
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await this.sessions.revokeSession(sessionId);
    await this.audit.record({
      actorUserId: userId,
      action: "auth.logout",
      targetType: "session",
      targetId: sessionId,
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessions.revokeAllForUser(userId);
    await this.audit.record({
      actorUserId: userId,
      action: "auth.logout_all",
      targetType: "user",
      targetId: userId,
    });
  }

  async forgotPassword(body: ForgotPasswordBody): Promise<void> {
    const email = body.email.trim().toLowerCase();
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    // Always 202 — no enumeration.
    if (!user || user.disabledAt) return;

    const token = await this.tokens.issueResetToken(user.id);
    await this.mail.sendPasswordResetEmail(email, token);
    await this.audit.record({
      actorUserId: user.id,
      action: "auth.password_forgot",
      targetType: "user",
      targetId: user.id,
    });
  }

  async resetPassword(body: ResetPasswordBody): Promise<void> {
    const userId = await this.tokens.consumeResetToken(body.token);
    if (!userId) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_TOKEN",
        "Reset token is invalid or expired.",
      );
    }

    const passwordHash = await this.passwords.hash(body.password);
    await this.db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId));
    await this.sessions.revokeAllForUser(userId);
    await this.audit.record({
      actorUserId: userId,
      action: "auth.password_reset",
      targetType: "user",
      targetId: userId,
    });
  }
}
