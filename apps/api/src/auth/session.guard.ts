import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { ApiException } from "../common/api-exception";
import { env } from "../config/env";
import { AUTH_REQUEST_KEY } from "./auth.types";
import { SessionService } from "./session.service";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const rawToken = req.cookies?.[env.sessionCookieName] as string | undefined;
    if (!rawToken) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
        "Authentication required.",
      );
    }

    const active = await this.sessions.resolveActiveSession(rawToken);
    if (!active) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
        "Authentication required.",
      );
    }

    // Fire-and-forget last-seen update.
    void this.sessions.touchSession(active.sessionId);

    req[AUTH_REQUEST_KEY] = {
      sessionId: active.sessionId,
      user: active.user,
    };
    return true;
  }
}
