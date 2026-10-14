import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import {
  consents,
  conversationMessages,
  conversationSessions,
  documentChunks,
  memories,
  messageCitations,
  messageFeedback,
  personalityEvidence,
  personalityProfiles,
  personalityTraits,
  sourceParticipants,
  usageRecords,
  users,
  type MemoraDb,
} from "@memora/db";
import type {
  CreateConversationBody,
  MessageFeedbackBody,
  SendChatMessageBody,
} from "@memora/shared";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
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
import { selectBiographyPassages } from "../prompt/biography-passages";
import { buildStickyRetrievalQuery } from "../prompt/prompt-builder";
import {
  expandRetrievalQuery,
  isSoftIdentityQuery,
} from "../retrieval/soft-identity-query";
import { expandQueryForRetrieval } from "../retrieval/query-expand";
import {
  applyCitationAbstention,
  isFactualBiographicalQuery,
} from "./citation-abstention";
import { buildRelationshipCard } from "./interlocutor-context";
import {
  collectVoiceSamples,
  inferChatLanguages,
  isNoisyStyleTrait,
} from "./voice-samples";
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
    const messageIds = messages.map((m) => m.id);
    const citationRows =
      messageIds.length === 0
        ? []
        : await this.db.query.messageCitations.findMany({
            where: inArray(messageCitations.messageId, messageIds),
          });
    const citesByMessage = new Map<string, typeof citationRows>();
    for (const c of citationRows) {
      const list = citesByMessage.get(c.messageId) ?? [];
      list.push(c);
      citesByMessage.set(c.messageId, list);
    }
    const chunkIds = [
      ...new Set(
        citationRows.map((c) => c.chunkId).filter((id): id is string => !!id),
      ),
    ];
    const memoryIds = [
      ...new Set(
        citationRows.map((c) => c.memoryId).filter((id): id is string => !!id),
      ),
    ];
    const chunks =
      chunkIds.length === 0
        ? []
        : await this.db.query.documentChunks.findMany({
            where: inArray(documentChunks.id, chunkIds),
          });
    const mems =
      memoryIds.length === 0
        ? []
        : await this.db.query.memories.findMany({
            where: inArray(memories.id, memoryIds),
          });
    const chunkById = new Map(chunks.map((c) => [c.id, c] as const));
    const memById = new Map(mems.map((m) => [m.id, m] as const));

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
        citations: (citesByMessage.get(m.id) ?? []).map((c) => {
          const chunk = c.chunkId ? chunkById.get(c.chunkId) : undefined;
          const mem = c.memoryId ? memById.get(c.memoryId) : undefined;
          const quote = (chunk?.content ?? mem?.text ?? "").slice(0, 180);
          return {
            marker: c.marker,
            kind: c.chunkId ? ("chunk" as const) : ("memory" as const),
            chunkId: c.chunkId,
            memoryId: c.memoryId,
            quote: quote || null,
          };
        }),
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
      const recentUserTexts = recent
        .filter((t) => t.role === "user")
        .map((t) => t.content);

      const audience = (membership.audience ?? "private") as MembershipAudience;
      const interlocutor = await this.loadInterlocutorContext(
        userId,
        personaId,
        audience,
      );
      const relationship =
        audience === "private"
          ? buildRelationshipCard(interlocutor)
          : ("neutral" as const);

      const interlocutorNames = [
        interlocutor.userDisplayName,
        ...interlocutor.importCounterparties,
      ].filter((n): n is string => Boolean(n));
      // Sticky multi-turn query keeps Sidr/2007 anchors across "hae" / "father?" follow-ups.
      const sticky = buildStickyRetrievalQuery(text, recentUserTexts, 3);
      const retrievalQuery = expandQueryForRetrieval(
        [
          expandRetrievalQuery(
            sticky,
            persona.biography,
            persona.displayName,
            interlocutorNames,
          ),
          ...interlocutorNames.slice(0, 2),
        ]
          .filter(Boolean)
          .join("\n")
          .slice(0, 1400),
      );
      const softIdentity = isSoftIdentityQuery(text);
      const [chunkCountRow] = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(documentChunks)
        .where(
          and(
            eq(documentChunks.personaId, personaId),
            eq(documentChunks.retrievalAllowed, true),
          ),
        );
      const hasImportedRecords = Number(chunkCountRow?.n ?? 0) > 0;
      // Bio is secondary to chats; score against sticky multi-turn query.
      const biographyPassages = selectBiographyPassages(
        persona.biography,
        sticky,
        {
          limit: hasImportedRecords ? 2 : 3,
          maxChars: 1_200,
          downweightNames: [persona.displayName],
        },
      );
      let retrieved: Awaited<ReturnType<HybridRetrievalService["retrieve"]>> = {
        chunks: [],
        memories: [],
      };
      try {
        retrieved = await this.retrieval.retrieve(
          { personaId, actorUserId: userId, audience },
          retrievalQuery,
          {
            chunkLimit: 10,
            // Only seed recency when search is empty — not on every import persona
            // (that was flooding Good-night noise over Sidr hits).
            softIdentityFallback: softIdentity,
          },
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
      const usefulTraits = confirmedTraits.filter(
        (t) => !isNoisyStyleTrait(t.value),
      );

      const styleCardFromTraits = Object.fromEntries(
        usefulTraits.map((t) => [t.facet, { note: t.value }]),
      );
      const compiled =
        (profile?.compiledCard as Record<string, unknown> | undefined) ?? {};
      const styleCard =
        usefulTraits.length > 0
          ? { ...compiled, ...styleCardFromTraits }
          : compiled;

      // Prefer real subject WhatsApp lines over lexicon trait quotes.
      const voiceChunks = await this.db
        .select({ content: documentChunks.content })
        .from(documentChunks)
        .where(
          and(
            eq(documentChunks.personaId, personaId),
            eq(documentChunks.retrievalAllowed, true),
            eq(documentChunks.speakerRole, "subject"),
          ),
        )
        .orderBy(desc(documentChunks.timeEnd), desc(documentChunks.createdAt))
        .limit(80);
      const voiceSamples = collectVoiceSamples(voiceChunks, 16);
      const styleExcerpts: string[] = [...voiceSamples];
      for (const t of usefulTraits.slice(0, 4)) {
        const ev = await this.db.query.personalityEvidence.findMany({
          where: eq(personalityEvidence.traitId, t.id),
          limit: 1,
        });
        const quote = ev[0]?.quote?.trim();
        if (quote && quote.length >= 8) styleExcerpts.push(quote.slice(0, 280));
      }
      const styleEvidenceLimited =
        styleExcerpts.length === 0 && Object.keys(styleCard).length === 0;
      const languages = inferChatLanguages(
        persona.languages ?? ["en"],
        voiceSamples,
      );

      const built = this.prompts.build({
        displayName: persona.displayName,
        languages,
        scenario: persona.scenario as "living" | "legacy",
        biography: persona.biography,
        biographyPassages,
        styleCard,
        styleExcerpts,
        styleEvidenceLimited,
        relationship,
        boundaries: [],
        hasImportedRecords,
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

      // Low temp for factual/bio; warmer for small talk (docs/06).
      const factualQuery = isFactualBiographicalQuery(text);
      const temperature = factualQuery
        ? 0.3
        : styleEvidenceLimited
          ? 0.5
          : voiceSamples.length > 0
            ? 0.75
            : 0.65;

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

      const chunkQuoteById = new Map(
        retrieved.chunks.map((c) => [c.chunkId, c.content] as const),
      );
      const memoryQuoteById = new Map(
        retrieved.memories.map((m) => [m.memoryId, m.text] as const),
      );

      // 3.9 — strip unknown markers; abstain when factual + no valid cites.
      const post = applyCitationAbstention({
        userMessage: text,
        reply: assembled,
        citationMap: built.citationMap,
        memoryMap: built.memoryMap,
      });
      const finalContent = aborted ? assembled : post.content;

      if (!aborted) {
        for (const cite of post.citations) {
          const quote =
            cite.kind === "chunk"
              ? (chunkQuoteById.get(cite.chunkId!) ?? "").slice(0, 180)
              : (memoryQuoteById.get(cite.memoryId!) ?? "").slice(0, 180);
          sse.send("citation", {
            marker: cite.marker,
            kind: cite.kind,
            chunkId: cite.chunkId ?? null,
            memoryId: cite.memoryId ?? null,
            quote: quote || null,
          });
          await this.db.insert(messageCitations).values({
            id: newId(),
            messageId: assistantMessageId,
            chunkId: cite.chunkId ?? null,
            memoryId: cite.memoryId ?? null,
            marker: cite.marker,
          });
        }
      }

      const status = aborted ? "aborted" : "complete";
      const quality = aborted
        ? "degraded"
        : post.abstained
          ? "abstained"
          : "ok";
      await this.finalizeAssistant({
        assistantMessageId,
        content: finalContent,
        status,
        model,
        quality,
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
        abstained: !aborted && post.abstained,
        content: finalContent,
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

  /**
   * Private/inner chat: owner display name + WhatsApp "other" labels.
   * Does not load other-speaker message bodies (still retrieval-blocked).
   */
  private async loadInterlocutorContext(
    userId: string,
    personaId: string,
    audience: MembershipAudience,
  ) {
    if (audience !== "private") {
      return { userDisplayName: null, importCounterparties: [] as string[] };
    }
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    const others = await this.db.query.sourceParticipants.findMany({
      where: and(
        eq(sourceParticipants.personaId, personaId),
        eq(sourceParticipants.role, "other"),
      ),
      limit: 24,
    });
    const labels = [
      ...new Set(
        others
          .map((p) => p.rawLabel?.trim())
          .filter((n): n is string => Boolean(n)),
      ),
    ].slice(0, 6);
    return {
      userDisplayName: user?.displayName?.trim() || null,
      importCounterparties: labels,
    };
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
