import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  memoryCorrectBodySchema,
  reviewDecisionBodySchema,
  type MemoryCorrectBody,
  type ReviewDecisionBody,
} from "@memora/shared";
import { CurrentAuth } from "../auth/current-auth.decorator";
import type { AuthContext } from "../auth/auth.types";
import { SessionGuard } from "../auth/session.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ReviewService } from "./review.service";

@Controller("personas/:personaId")
@UseGuards(SessionGuard)
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  @Get("review-queue")
  async queue(
    @CurrentAuth() auth: AuthContext,
    @Param("personaId") personaId: string,
  ) {
    return this.review.getQueue(auth.user.id, personaId);
  }

  @Post("traits/:traitId/decision")
  async decideTrait(
    @CurrentAuth() auth: AuthContext,
    @Param("personaId") personaId: string,
    @Param("traitId") traitId: string,
    @Body(new ZodValidationPipe(reviewDecisionBodySchema))
    body: ReviewDecisionBody,
  ) {
    return this.review.decideTrait(auth.user.id, personaId, traitId, body);
  }

  @Post("memories/:memoryId/decision")
  async decideMemory(
    @CurrentAuth() auth: AuthContext,
    @Param("personaId") personaId: string,
    @Param("memoryId") memoryId: string,
    @Body(new ZodValidationPipe(reviewDecisionBodySchema))
    body: ReviewDecisionBody,
  ) {
    return this.review.decideMemory(auth.user.id, personaId, memoryId, body);
  }

  @Post("memories/:memoryId/correct")
  async correctMemory(
    @CurrentAuth() auth: AuthContext,
    @Param("personaId") personaId: string,
    @Param("memoryId") memoryId: string,
    @Body(new ZodValidationPipe(memoryCorrectBodySchema))
    body: MemoryCorrectBody,
  ) {
    return this.review.correctMemory(auth.user.id, personaId, memoryId, body);
  }
}
