import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  completeFileBodySchema,
  createImportBodySchema,
  presignFileBodySchema,
  subjectMappingBodySchema,
  type CompleteFileBody,
  type CreateImportBody,
  type PresignFileBody,
  type SubjectMappingBody,
} from "@memora/shared";
import { CurrentAuth } from "../auth/current-auth.decorator";
import type { AuthContext } from "../auth/auth.types";
import { SessionGuard } from "../auth/session.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { FilesService } from "./files.service";

@Controller("personas/:personaId")
@UseGuards(SessionGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post("imports")
  createImport(
    @CurrentAuth() auth: AuthContext,
    @Param("personaId") personaId: string,
    @Body(new ZodValidationPipe(createImportBodySchema)) _body: CreateImportBody,
  ) {
    return this.files.createImport(auth.user.id, personaId);
  }

  @Get("imports/:importId")
  getImport(
    @CurrentAuth() auth: AuthContext,
    @Param("personaId") personaId: string,
    @Param("importId") importId: string,
  ) {
    return this.files.getImport(auth.user.id, personaId, importId);
  }

  @Get("files")
  listFiles(
    @CurrentAuth() auth: AuthContext,
    @Param("personaId") personaId: string,
  ) {
    return this.files.listFiles(auth.user.id, personaId);
  }

  @Post("files/presign")
  presign(
    @CurrentAuth() auth: AuthContext,
    @Param("personaId") personaId: string,
    @Body(new ZodValidationPipe(presignFileBodySchema)) body: PresignFileBody,
  ) {
    return this.files.presign(auth.user.id, personaId, body);
  }

  @Post("files/:fileId/complete")
  complete(
    @CurrentAuth() auth: AuthContext,
    @Param("personaId") personaId: string,
    @Param("fileId") fileId: string,
    @Body(new ZodValidationPipe(completeFileBodySchema)) body: CompleteFileBody,
  ) {
    return this.files.complete(auth.user.id, personaId, fileId, body);
  }

  @Get("files/:fileId/participants")
  listParticipants(
    @CurrentAuth() auth: AuthContext,
    @Param("personaId") personaId: string,
    @Param("fileId") fileId: string,
  ) {
    return this.files.listParticipants(auth.user.id, personaId, fileId);
  }

  @Post("files/:fileId/subject-mapping")
  mapSubject(
    @CurrentAuth() auth: AuthContext,
    @Param("personaId") personaId: string,
    @Param("fileId") fileId: string,
    @Body(new ZodValidationPipe(subjectMappingBodySchema))
    body: SubjectMappingBody,
  ) {
    return this.files.mapSubject(auth.user.id, personaId, fileId, body);
  }
}
