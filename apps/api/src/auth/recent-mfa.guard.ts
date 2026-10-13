import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { ApiException } from "../common/api-exception";
import { AUTH_REQUEST_KEY } from "./auth.types";
import { MfaService } from "./mfa.service";
import { StepUpService } from "./step-up.service";

/**
 * Requires SessionGuard first.
 * If the user has MFA enabled, a recent step-up is required.
 * If MFA is not enabled, the guard passes (nothing to step up).
 */
@Injectable()
export class RecentMfaGuard implements CanActivate {
  constructor(
    private readonly stepUp: StepUpService,
    private readonly mfa: MfaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const auth = req[AUTH_REQUEST_KEY];
    if (!auth) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
        "Authentication required.",
      );
    }

    if (!(await this.mfa.hasConfirmedMfa(auth.user.id))) {
      return true;
    }

    if (!(await this.stepUp.isVerified(auth.sessionId))) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        "MFA_STEP_UP_REQUIRED",
        "Confirm MFA again to continue.",
      );
    }
    return true;
  }
}
