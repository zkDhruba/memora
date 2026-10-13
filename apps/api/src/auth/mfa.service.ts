import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  mfaFactors,
  recoveryCodes,
  type MemoraDb,
} from "@memora/db";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { generateSecret, generateURI, verifySync } from "otplib";
import { randomBytes } from "node:crypto";
import { ApiException } from "../common/api-exception";
import { CryptoService } from "../common/crypto.service";
import { newId, sha256 } from "../common/ids";
import { DB } from "../db/db.tokens";
import { AuditService } from "./audit.service";
import { StepUpService } from "./step-up.service";

const RECOVERY_CODE_COUNT = 10;

@Injectable()
export class MfaService {
  constructor(
    @Inject(DB) private readonly db: MemoraDb,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly stepUpService: StepUpService,
  ) {}

  async hasConfirmedMfa(userId: string): Promise<boolean> {
    const row = await this.db.query.mfaFactors.findFirst({
      where: and(
        eq(mfaFactors.userId, userId),
        eq(mfaFactors.type, "totp"),
        isNotNull(mfaFactors.confirmedAt),
      ),
    });
    return Boolean(row);
  }

  async setup(userId: string, email: string): Promise<{
    otpauthUrl: string;
    secret: string;
  }> {
    if (await this.hasConfirmedMfa(userId)) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        "MFA_ALREADY_ENABLED",
        "MFA is already enabled for this account.",
      );
    }

    // Drop any pending (unconfirmed) factors.
    await this.db
      .delete(mfaFactors)
      .where(
        and(
          eq(mfaFactors.userId, userId),
          eq(mfaFactors.type, "totp"),
          isNull(mfaFactors.confirmedAt),
        ),
      );

    const secret = generateSecret();
    await this.db.insert(mfaFactors).values({
      id: newId(),
      userId,
      type: "totp",
      secretEncrypted: this.crypto.encrypt(secret),
      confirmedAt: null,
    });

    const otpauthUrl = generateURI({
      issuer: "Memora",
      label: email,
      secret,
    });

    await this.audit.record({
      actorUserId: userId,
      action: "auth.mfa_setup",
      targetType: "user",
      targetId: userId,
    });

    return { otpauthUrl, secret };
  }

  async confirm(
    userId: string,
    code: string,
  ): Promise<{ recoveryCodes: string[] }> {
    const factor = await this.db.query.mfaFactors.findFirst({
      where: and(
        eq(mfaFactors.userId, userId),
        eq(mfaFactors.type, "totp"),
        isNull(mfaFactors.confirmedAt),
      ),
    });

    if (!factor) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "MFA_SETUP_REQUIRED",
        "Call /auth/mfa/setup before confirming.",
      );
    }

    const secret = this.crypto.decrypt(factor.secretEncrypted);
    const result = verifySync({ secret, token: code });
    if (!result.valid) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "INVALID_MFA",
        "Invalid authenticator code.",
      );
    }

    const plainCodes = this.generateRecoveryCodes();
    await this.db.transaction(async (tx) => {
      await tx
        .update(mfaFactors)
        .set({ confirmedAt: new Date() })
        .where(eq(mfaFactors.id, factor.id));

      await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));

      await tx.insert(recoveryCodes).values(
        plainCodes.map((code) => ({
          id: newId(),
          userId,
          codeHash: sha256(this.normalizeRecoveryCode(code)),
        })),
      );
    });

    await this.audit.record({
      actorUserId: userId,
      action: "auth.mfa_confirm",
      targetType: "user",
      targetId: userId,
    });

    return { recoveryCodes: plainCodes };
  }

  /**
   * Verify TOTP or recovery code for an MFA-enabled user.
   * Consumes a recovery code on success.
   */
  async verifyUserMfa(
    userId: string,
    input: { totp?: string; recoveryCode?: string },
  ): Promise<"totp" | "recovery"> {
    if (input.totp) {
      const ok = await this.verifyTotp(userId, input.totp);
      if (!ok) {
        throw new ApiException(
          HttpStatus.UNAUTHORIZED,
          "INVALID_MFA",
          "Invalid authenticator code.",
        );
      }
      return "totp";
    }

    if (input.recoveryCode) {
      const ok = await this.consumeRecoveryCode(userId, input.recoveryCode);
      if (!ok) {
        throw new ApiException(
          HttpStatus.UNAUTHORIZED,
          "INVALID_MFA",
          "Invalid recovery code.",
        );
      }
      return "recovery";
    }

    throw new ApiException(
      HttpStatus.UNAUTHORIZED,
      "MFA_REQUIRED",
      "Authenticator or recovery code is required.",
    );
  }

  async verifyTotp(userId: string, token: string): Promise<boolean> {
    const factor = await this.db.query.mfaFactors.findFirst({
      where: and(
        eq(mfaFactors.userId, userId),
        eq(mfaFactors.type, "totp"),
        isNotNull(mfaFactors.confirmedAt),
      ),
    });
    if (!factor) return false;
    const secret = this.crypto.decrypt(factor.secretEncrypted);
    return verifySync({ secret, token }).valid;
  }

  async consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    const normalized = this.normalizeRecoveryCode(code);
    const hash = sha256(normalized);
    const row = await this.db.query.recoveryCodes.findFirst({
      where: and(
        eq(recoveryCodes.userId, userId),
        eq(recoveryCodes.codeHash, hash),
        isNull(recoveryCodes.usedAt),
      ),
    });
    if (!row) return false;
    await this.db
      .update(recoveryCodes)
      .set({ usedAt: new Date() })
      .where(eq(recoveryCodes.id, row.id));
    return true;
  }

  async verifyStepUp(
    userId: string,
    sessionId: string,
    input: { totp?: string; recoveryCode?: string },
  ): Promise<void> {
    if (!(await this.hasConfirmedMfa(userId))) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "MFA_NOT_ENABLED",
        "Enable MFA before using step-up.",
      );
    }
    await this.verifyUserMfa(userId, input);
    await this.stepUpService.markVerified(sessionId);
    await this.audit.record({
      actorUserId: userId,
      action: "auth.mfa_step_up",
      targetType: "session",
      targetId: sessionId,
    });
  }

  private generateRecoveryCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
      const hex = randomBytes(4).toString("hex").toUpperCase();
      codes.push(`${hex.slice(0, 4)}-${hex.slice(4)}`);
    }
    return codes;
  }

  private normalizeRecoveryCode(code: string): string {
    return code.replace(/[-\s]/g, "").toUpperCase();
  }
}
