import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  consentGrantBodySchema,
  createPersonaBodySchema,
  updatePersonaBodySchema,
  type ConsentGrantBody,
  type CreatePersonaBody,
  type UpdatePersonaBody,
} from "@memora/shared";
import { CurrentAuth } from "../auth/current-auth.decorator";
import type { AuthContext } from "../auth/auth.types";
import { RecentMfaGuard } from "../auth/recent-mfa.guard";
import { SessionGuard } from "../auth/session.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PersonasService } from "./personas.service";

@Controller("personas")
@UseGuards(SessionGuard)
export class PersonasController {
  constructor(private readonly personas: PersonasService) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query("for") forParam?: string,
  ) {
    const data = await this.personas.listForUser(auth.user.id, {
      forChat: forParam === "chat",
    });
    return { data };
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createPersonaBodySchema)) body: CreatePersonaBody,
  ) {
    return this.personas.create(
      auth.user.id,
      Boolean(auth.user.emailVerifiedAt),
      body,
    );
  }

  @Get(":id")
  async getOne(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ) {
    return this.personas.getOne(auth.user.id, id);
  }

  @Patch(":id")
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePersonaBodySchema)) body: UpdatePersonaBody,
  ) {
    return this.personas.update(auth.user.id, id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RecentMfaGuard)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ) {
    await this.personas.softDelete(auth.user.id, id);
  }

  @Post(":id/restore")
  async restore(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ) {
    return this.personas.restore(auth.user.id, id);
  }

  @Get(":id/consents")
  async listConsents(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ) {
    return this.personas.listConsents(auth.user.id, id);
  }

  @Post(":id/consents")
  async grantConsent(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(consentGrantBodySchema)) body: ConsentGrantBody,
  ) {
    return this.personas.grantConsent(auth.user.id, id, body);
  }

  @Post(":id/consents/:consentId/revoke")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeConsent(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("consentId") consentId: string,
  ) {
    await this.personas.revokeConsent(auth.user.id, id, consentId);
  }
}
