import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  @UseGuards(SessionGuard)
  getMe(@CurrentAuth() auth: AuthContext) {
    return this.me.getMe(auth.user);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  async deleteMe(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(deleteMeBodySchema)) body: DeleteMeBody,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.me.deleteAccount(auth.user, auth.sessionId, body);
    clearSessionCookie(res);
  }
}
