import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
  verifyEmailBodySchema,
  type ForgotPasswordBody,
  type LoginBody,
  type RegisterBody,
  type ResetPasswordBody,
  type VerifyEmailBody,
} from "@memora/shared";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ApiException } from "../common/api-exception";
import { AuthService } from "./auth.service";
import { CurrentAuth } from "./current-auth.decorator";
import type { AuthContext } from "./auth.types";
import { clearSessionCookie, setSessionCookie } from "./session-cookie";
import { SessionGuard } from "./session.guard";
import { SessionService } from "./session.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Post("register")
  async register(
    @Body(new ZodValidationPipe(registerBodySchema)) body: RegisterBody,
  ) {
    return this.auth.register(body);
  }

  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailBodySchema)) body: VerifyEmailBody,
  ) {
    return this.auth.verifyEmail(body);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginBodySchema)) body: LoginBody,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(body, {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });
    setSessionCookie(res, result.rawToken, result.expiresAt);
    return { userId: result.userId };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(auth.sessionId, auth.user.id);
    clearSessionCookie(res);
  }

  @Post("logout-all")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  async logoutAll(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logoutAll(auth.user.id);
    clearSessionCookie(res);
  }

  @Post("password/forgot")
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordBodySchema))
    body: ForgotPasswordBody,
  ) {
    await this.auth.forgotPassword(body);
    return { accepted: true };
  }

  @Post("password/reset")
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordBodySchema))
    body: ResetPasswordBody,
  ) {
    await this.auth.resetPassword(body);
  }

  @Get("sessions")
  @UseGuards(SessionGuard)
  async listSessions(@CurrentAuth() auth: AuthContext) {
    const rows = await this.sessions.listForUser(auth.user.id);
    return {
      data: rows.map((row) => ({
        id: row.id,
        userAgent: row.userAgent,
        ipPrefix: row.ipPrefix,
        createdAt: row.createdAt,
        lastSeenAt: row.lastSeenAt,
        expiresAt: row.expiresAt,
        current: row.id === auth.sessionId,
      })),
    };
  }

  @Delete("sessions/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  async revokeSession(
    @CurrentAuth() auth: AuthContext,
    @Param("id") sessionId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.sessions.listForUser(auth.user.id);
    const target = rows.find((r) => r.id === sessionId);
    if (!target) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "SESSION_NOT_FOUND",
        "Session not found.",
      );
    }
    await this.sessions.revokeSession(sessionId);
    if (sessionId === auth.sessionId) {
      clearSessionCookie(res);
    }
  }
}
