import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  deleteMeBodySchema,
  type DeleteMeBody,
} from "@memora/shared";
import type { Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CurrentAuth } from "./current-auth.decorator";
import type { AuthContext } from "./auth.types";
import { MeService } from "./me.service";
import { clearSessionCookie } from "./session-cookie";
import { SessionGuard } from "./session.guard";

@Controller("me")
@UseGuards(SessionGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  getMe(@CurrentAuth() auth: AuthContext) {
    return this.me.getMe(auth.user);
  }

  /** Recent audit events where this user was the actor. */
  @Get("audit")
  listAudit(
    @CurrentAuth() auth: AuthContext,
    @Query("limit") limitRaw?: string,
  ) {
    const parsed = limitRaw ? Number(limitRaw) : undefined;
    const limit =
      parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;
    return this.me.listAudit(auth.user.id, limit);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMe(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(deleteMeBodySchema)) body: DeleteMeBody,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.me.deleteAccount(auth.user, auth.sessionId, body);
    clearSessionCookie(res);
  }
}
