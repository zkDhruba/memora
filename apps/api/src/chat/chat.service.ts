import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import {
  consents,
  conversationMessages,
  conversationSessions,
  memories,
  messageCitations,
  messageFeedback,
  personalityEvidence,
  personalityProfiles,
  personalityTraits,
  usageRecords,
  type MemoraDb,
} from "@memora/db";
import type {
  CreateConversationBody,
  MessageFeedbackBody,
  SendChatMessageBody,
} from "@memora/shared";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { ApiException } from "../common/api-exception";
import { newId } from "../common/ids";
import { AuditService } from "../auth/audit.service";
import { DB } from "../db/db.tokens";
import { env } from "../config/env";
import { LLM_PORT, type LlmPort } from "../llm/llm.port";
import { PersonaAccessService } from "../personas/persona-access.service";
import { PromptBuilderService } from "../prompt/prompt-builder.service";
import type { MembershipAudience } from "../retrieval/persona-scope";
import { HybridRetrievalService } from "../retrieval/hybrid-retrieval.service";
import type { SseWriter } from "./sse";

const HEARTBEAT_MS = 15_000;
const RECENT_TURN_LIMIT = 16;

@Injectable()
export class ChatService {
  private readonly log = new Logger(ChatService.name);

  constructor(
    @Inject(DB) private readonly db: MemoraDb,
    @Inject(PersonaAccessService) private readonly access: PersonaAccessService,
    @Inject(PromptBuilderService) private readonly prompts: PromptBuilderService,
    @Inject(HybridRetrievalService)
    private readonly retrieval: HybridRetrievalService,
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async listSessions(userId: string, personaId: string) {
    await this.access.requireMember(userId, personaId);
    const rows = await this.db.query.conversationSessions.findMany({
      where: and(
        eq(conversationSessions.personaId, personaId),
        eq(conversationSessions.userId, userId),
        isNull(conversationSessions.deletedAt),
      ),
      orderBy: [desc(conversationSessions.updatedAt)],
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        title: r.title,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    };
  }

  async createSession(
    userId: string,
    personaId: string,
    body: CreateConversationBody,
  ) {
    await this.requireChatReady(userId, personaId);
    const id = newId();
    await this.db.insert(conversationSessions).values({
      id,
      personaId,
      userId,
      title: body.title?.trim() || null,
    });
    return { id, title: body.title?.trim() || null };
  }

  async getSession(userId: string, personaId: string, sessionId: string) {
    const session = await this.requireSessionOwner(userId, personaId, sessionId);
    const messages = await this.db.query.conversationMessages.findMany({
      where: eq(conversationMessages.sessionId, sessionId),
      orderBy: [asc(conversationMessages.createdAt)],
    });
    return {
      id: session.id,
      title: session.title,
      summary: session.summary,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        status: m.status,
        model: m.model,
        quality: m.quality,
        createdAt: m.createdAt,
      })),
    };
  }

  async deleteSession(userId: string, personaId: string, sessionId: string) {
    await this.requireSessionOwner(userId, personaId, sessionId);
    await this.db
      .update(conversationSessions)
      .set({ deletedAt: new Date() })
      .where(eq(conversationSessions.id, sessionId));
    // Conversational memories for this session
    await this.db
      .delete(memories)
      .where(
        and(
          eq(memories.personaId, personaId),
          eq(memories.conversationSessionId, sessionId),
          eq(memories.domain, "conversational"),
        ),
      );
    await this.audit.record({
      actorUserId: userId,
      personaId,
      action: "conversation.delete",
      targetType: "conversation_session",
      targetId: sessionId,
    });
  }

  async feedback(
    userId: string,
    messageId: string,
    body: MessageFeedbackBody,
  ) {
    const message = await this.db.query.conversationMessages.findFirst({
      where: eq(conversationMessages.id, messageId),
    });
    if (!message) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "MESSAGE_NOT_FOUND",
        "Message not found.",
      );
    }
    await this.requireSessionOwner(userId, message.personaId, message.sessionId);
    const id = newId();
    await this.db.insert(messageFeedback).values({
      id,
      messageId,
      userId,
      rating: body.rating,
      note: body.note?.trim() || null,
    });
    return { id };
  }

  /**
   * Stream an assistant reply. Always finalizes the assistant row even if the
   * client disconnects (AbortSignal) — Done when for 3.8.
   */
  async streamMessage(
    userId: string,
    personaId: string,
    sessionId: string,
    body: SendChatMessageBody,
    sse: SseWriter,
    signal: AbortSignal,
  ): Promise<void> {
    const { persona, membership } = await this.requireChatReady(
      userId,
      personaId,
    );
    await this.requireSessionOwner(userId, personaId, sessionId);

    const userMessageId = newId();
    const assistantMessageId = newId();
    const text = body.text.trim();

    await this.db.insert(conversationMessages).values({
      id: userMessageId,
      sessionId,
      personaId,
      role: "user",
      content: text,
      status: "complete",
    });

    await this.db.insert(conversationMessages).values({
      id: assistantMessageId,
      sessionId,
      personaId,
      role: "assistant",
      content: "",
      status: "streaming",
    });

    const heartbeat = setInterval(() => {
      sse.comment("heartbeat");
    }, HEARTBEAT_MS);

    const started = Date.now();
    let assembled = "";
    let model: string | null = null;
    let provider = persona.providerKey ?? "openrouter";
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let aborted = false;
    let errorCode: string | null = null;

    try {
      const recent = await this.loadRecentTurns(sessionId, userMessageId);
      const previousUser = [...recent]
        .reverse()
        .find((t) => t.role === "user");
      const retrievalQuery = this.prompts.retrievalQuery(
        text,
        previousUser?.content,
      );

      const audience = (membership.audience ?? "private") as MembershipAudience;
      let retrieved: Awaited<ReturnType<HybridRetrievalService["retrieve"]>> = {
        chunks: [],
        memories: [],
      };
      try {
        retrieved = await this.retrieval.retrieve(
          { personaId, actorUserId: userId, audience },
          retrievalQuery,
        );
      } catch (err) {
        // Thin personas / missing embed key: still chat with empty retrieval.
        this.log.warn(
          `retrieval skipped: ${(err as Error).message}`,
        );
      }

      const profile = await this.db.query.personalityProfiles.findFirst({
        where: eq(personalityProfiles.personaId, personaId),
      });
      const confirmedTraits = await this.db.query.personalityTraits.findMany({
        where: and(
          eq(personalityTraits.personaId, personaId),
          eq(personalityTraits.status, "confirmed"),
        ),
        limit: 24,
      });

      const styleCardFromTraits = Object.fromEntries(
        confirmedTraits.map((t) => [t.facet, { note: t.value }]),
      );
      const compiled =
        (profile?.compiledCard as Record<string, unknown> | undefined) ?? {};
      const styleCard =
        confirmedTraits.length > 0
          ? { ...compiled, ...styleCardFromTraits }
          : compiled;
      const styleEvidenceLimited =
        confirmedTraits.length === 0 && Object.keys(compiled).length === 0;

      // Short evidence quotes from confirmed traits (cadence anchors).
      const styleExcerpts: string[] = [];
      for (const t of confirmedTraits.slice(0, 8)) {
        const ev = await this.db.query.personalityEvidence.findMany({
          where: eq(personalityEvidence.traitId, t.id),
          limit: 1,
        });
        const quote = ev[0]?.quote?.trim();
        if (quote) styleExcerpts.push(quote.slice(0, 280));
      }

      const built = this.prompts.build({
        displayName: persona.displayName,
        languages: persona.languages ?? ["en"],
        scenario: persona.scenario as "living" | "legacy",
        biography: persona.biography,
        styleCard,
        styleExcerpts,
        styleEvidenceLimited,
        relationship: "neutral",
        boundaries: [],
        chunks: retrieved.chunks.map((c) => ({
          chunkId: c.chunkId,
          content: c.content,
          sourceKind: c.sourceKind,
          speakerRole: c.speakerRole,
          score: c.score,
        })),
        memories: retrieved.memories.map((m) => ({
          memoryId: m.memoryId,
          text: m.text,
          score: m.score,
        })),
        conversationSummary: (
          await this.db.query.conversationSessions.findFirst({
            where: eq(conversationSessions.id, sessionId),
          })
        )?.summary,
        recentTurns: recent,
        userMessage: text,
        previousUserMessage: previousUser?.content,
      });

      if (!persona.providerKey) {
        // Prefer configured provider; default openrouter for testing.
        provider = "openrouter";
      }

      // Slightly warmer when we have style evidence (docs/06 small-talk band).
      const temperature = styleEvidenceLimited ? 0.45 : 0.65;

      for await (const chunk of this.llm.stream({
        personaId,
        purpose: "chat",
        provider,
        model: env.openrouter.defaultModel(),
        messages: built.messages,
        maxOutputTokens: 1024,
        temperature,
        signal,
      })) {
        if (chunk.type === "token") {
          assembled += chunk.text;
          sse.send("token", { text: chunk.text });
        } else {
          assembled = chunk.text || assembled;
          model = chunk.model;
          provider = chunk.provider;
          inputTokens = chunk.inputTokens;
          outputTokens = chunk.outputTokens;
          aborted = chunk.aborted;
        }
      }

      // Emit citations for markers present in the reply (full abstention in 3.9).
      const usedMarkers = new Set(
        [...assembled.matchAll(/\[\[([cm]\d+)\]\]/g)].map((m) => m[1]!),
      );
      for (const [marker, chunkId] of Object.entries(built.citationMap)) {
        if (usedMarkers.size > 0 && !usedMarkers.has(marker)) continue;
        if (usedMarkers.size === 0) continue;
        sse.send("citation", { marker, chunkId, kind: "chunk" });
        await this.db.insert(messageCitations).values({
          id: newId(),
          messageId: assistantMessageId,
          chunkId,
          memoryId: null,
          marker,
        });
      }
      for (const [marker, memoryId] of Object.entries(built.memoryMap)) {
        if (usedMarkers.size > 0 && !usedMarkers.has(marker)) continue;
        if (usedMarkers.size === 0) continue;
        sse.send("citation", { marker, memoryId, kind: "memory" });
        await this.db.insert(messageCitations).values({
          id: newId(),
          messageId: assistantMessageId,
          chunkId: null,
          memoryId,
          marker,
        });
      }

      const status = aborted ? "aborted" : "complete";
      await this.finalizeAssistant({
        assistantMessageId,
        content: assembled,
        status,
        model,
        quality: aborted ? "degraded" : "ok",
        errorCode: null,
      });

      await this.db.insert(usageRecords).values({
        id: newId(),
        personaId,
        userId,
        purpose: "chat",
        provider,
        model: model ?? "unknown",
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - started,
        messageId: assistantMessageId,
      });

      await this.db
        .update(conversationSessions)
        .set({ updatedAt: new Date() })
        .where(eq(conversationSessions.id, sessionId));

      sse.send("done", {
        messageId: assistantMessageId,
        userMessageId,
        status,
        aborted,
      });
    } catch (err) {
      aborted = signal.aborted || aborted;
      errorCode =
        err instanceof ApiException
          ? ((err.getResponse() as { error?: { code?: string } })?.error
              ?.code ?? "CHAT_ERROR")
          : "CHAT_ERROR";
      this.log.warn(
        `chat stream failed session=${sessionId}: ${(err as Error).message}`,
      );

      await this.finalizeAssistant({
        assistantMessageId,
        content: assembled,
        status: aborted ? "aborted" : "error",
        model,
        quality: "degraded",
        errorCode,
      });

      const message =
        err instanceof ApiException
          ? ((err.getResponse() as { error?: { message?: string } })?.error
              ?.message ?? (err as Error).message)
          : (err as Error).message;

      sse.send("error", {
        code: errorCode,
        message,
        messageId: assistantMessageId,
      });
    } finally {
      clearInterval(heartbeat);
      sse.end();
    }
  }

  /** Test/helper: finalize rules used when the client aborts mid-stream. */
  async finalizeAssistant(input: {
    assistantMessageId: string;
    content: string;
    status: "complete" | "aborted" | "error";
    model: string | null;
    quality: "ok" | "degraded" | "abstained" | null;
    errorCode: string | null;
  }): Promise<void> {
    await this.db
      .update(conversationMessages)
      .set({
        content: input.content,
        status: input.status,
        model: input.model,
        quality: input.quality,
        errorCode: input.errorCode,
      })
      .where(eq(conversationMessages.id, input.assistantMessageId));
  }

  private async loadRecentTurns(sessionId: string, excludeId: string) {
    const rows = await this.db.query.conversationMessages.findMany({
      where: and(
        eq(conversationMessages.sessionId, sessionId),
        eq(conversationMessages.status, "complete"),
      ),
      orderBy: [desc(conversationMessages.createdAt)],
      limit: RECENT_TURN_LIMIT + 4,
    });
    return rows
      .filter((m) => m.id !== excludeId && m.role !== "system")
      .reverse()
      .slice(-RECENT_TURN_LIMIT)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
  }

  private async requireChatReady(userId: string, personaId: string) {
    const access = await this.access.requireMember(userId, personaId);
    const { persona } = access;
    if (
      persona.status === "suspended" ||
      persona.status === "deleting" ||
      persona.deletedAt
    ) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "PERSONA_NOT_READY",
        "This persona cannot chat right now.",
        { status: persona.status },
      );
    }
    const converse = await this.db.query.consents.findFirst({
      where: and(
        eq(consents.personaId, personaId),
        eq(consents.purpose, "converse"),
        isNull(consents.revokedAt),
      ),
    });
    if (!converse) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "PERSONA_NOT_READY",
        "Converse consent is required before chatting.",
      );
    }
    return access;
  }

  private async requireSessionOwner(
    userId: string,
    personaId: string,
    sessionId: string,
  ) {
    const session = await this.db.query.conversationSessions.findFirst({
      where: and(
        eq(conversationSessions.id, sessionId),
        eq(conversationSessions.personaId, personaId),
        isNull(conversationSessions.deletedAt),
      ),
    });
    if (!session || session.userId !== userId) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "CONVERSATION_NOT_FOUND",
        "Conversation not found.",
      );
    }
    return session;
  }
}
