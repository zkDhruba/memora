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
  createConversationBodySchema,
  messageFeedbackBodySchema,
  sendChatMessageBodySchema,
  type CreateConversationBody,
  type MessageFeedbackBody,
  type SendChatMessageBody,
} from "@memora/shared";
import type { Request, Response } from "express";
import { CurrentAuth } from "../auth/current-auth.decorator";
import type { AuthContext } from "../auth/auth.types";
import { SessionGuard } from "../auth/session.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PlanGuardService } from "../plans/plan-guard.service";
import { ChatService } from "./chat.service";
import { createSseWriter } from "./sse";
import { ApiException } from "../common/api-exception";

@Controller()
@UseGuards(SessionGuard)
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly plans: PlanGuardService,
  ) {}

  @Get("personas/:personaId/conversations")
  list(
    @CurrentAuth() auth: AuthContext,
    @Param("personaId") personaId: string,
  ) {
    return this.chat.listSessions(auth.user.id, personaId);
  }

  @Post("personas/:personaId/conversations")
  create(
    @CurrentAuth() auth: AuthContext,
    @Param("personaId") personaId: string,
    @Body(new ZodValidationPipe(createConversationBodySchema))
    body: CreateConversationBody,
  ) {
    return this.chat.createSession(auth.user.id, personaId, body);
  }

  @Get("personas/:personaId/conversations/:sessionId")
  getOne(
    @CurrentAuth() auth: AuthContext,
    @Param("personaId") personaId: string,
    @Param("sessionId") sessionId: string,
  ) {
    return this.chat.getSession(auth.user.id, personaId, sessionId);
  }

  @Delete("personas/:personaId/conversations/:sessionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param("personaId") personaId: string,
    @Param("sessionId") sessionId: string,
  ) {
    await this.chat.deleteSession(auth.user.id, personaId, sessionId);
  }

  @Post("personas/:personaId/conversations/:sessionId/messages")
  async send(
    @CurrentAuth() auth: AuthContext,
    @Param("personaId") personaId: string,
    @Param("sessionId") sessionId: string,
    @Body(new ZodValidationPipe(sendChatMessageBodySchema))
    body: SendChatMessageBody,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      await this.plans.assertCanSendChatMessage(auth.user.id);
    } catch (err) {
      if (err instanceof ApiException && !res.headersSent) {
        res.status(err.getStatus()).json(err.getResponse());
        return;
      }
      throw err;
    }

    const sse = createSseWriter(res);
    const ac = new AbortController();
    const onClose = () => ac.abort();
    req.on("close", onClose);
    try {
      await this.chat.streamMessage(
        auth.user.id,
        personaId,
        sessionId,
        body,
        sse,
        ac.signal,
      );
    } finally {
      req.off("close", onClose);
    }
  }

  @Post("personas/:personaId/messages/:messageId/feedback")
  feedback(
    @CurrentAuth() auth: AuthContext,
    @Param("messageId") messageId: string,
    @Body(new ZodValidationPipe(messageFeedbackBodySchema))
    body: MessageFeedbackBody,
  ) {
    return this.chat.feedback(auth.user.id, messageId, body);
  }
}
