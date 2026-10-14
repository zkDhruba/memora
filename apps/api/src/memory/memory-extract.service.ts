import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  documentChunks,
  sourceMessages,
  sourceParticipants,
  type MemoraDb,
} from "@memora/db";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { env } from "../config/env";
import { DB } from "../db/db.tokens";
import { LLM_PORT, type LlmPort } from "../llm/llm.port";
import { filterGroundedByQuote } from "../personality/quote-check";
import { MemoryRepository } from "./memory.repository";

const BIO_TYPES = [
  "semantic",
  "episodic",
  "autobiographical",
  "relationship",
  "temporal",
] as const;

const llmMemorySchema = z.object({
  memories: z.array(
    z.object({
      text: z.string().min(1).max(500),
      memoryType: z.enum(BIO_TYPES),
      quote: z.string().min(2).max(280),
      confidence: z.number().min(0).max(1).optional(),
      sensitivity: z
        .enum(["none", "health", "belief", "minor", "financial", "other"])
        .optional(),
      timePrecision: z
        .enum(["day", "month", "year", "approximate", "unknown"])
        .optional(),
    }),
  ),
});

export type MemoryExtractResult = {
  inserted: number;
  droppedFakeQuotes: number;
  sampleSize: number;
};

@Injectable()
export class MemoryExtractService {
  private readonly log = new Logger(MemoryExtractService.name);

  constructor(
    @Inject(DB) private readonly db: MemoraDb,
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    @Inject(MemoryRepository) private readonly memories: MemoryRepository,
  ) {}

  /**
   * Extract biographical candidates from subject messages + owner-ish chunks.
   * Always domain=biographical. Quote gate drops hallucinations.
   */
  async extractBiographical(
    personaId: string,
    opts?: { skipLlm?: boolean; maxSample?: number },
  ): Promise<MemoryExtractResult> {
    const sample = await this.loadExtractionSpans(personaId, opts?.maxSample ?? 40);
    const corpus = sample.map((s) => s.text).join("\n");
    if (opts?.skipLlm || sample.length === 0) {
      return { inserted: 0, droppedFakeQuotes: 0, sampleSize: sample.length };
    }

    const numbered = sample
      .map((s, i) => `[${i + 1}] ${s.text}`)
      .join("\n");

    const { data } = await this.llm.completeJson({
      personaId,
      purpose: "extract_memory",
      provider: "openrouter",
      model: env.openrouter.defaultModel(),
      temperature: 0.2,
      maxOutputTokens: 1600,
      messages: [
        {
          role: "system",
          content:
            "Extract biographical memories about the subject from their own words. " +
            "Each memory MUST include a quote that is an exact substring of the source text. " +
            "Do not invent quotes. Domain is always biographical (life facts), never conversational chat meta.",
        },
        {
          role: "user",
          content: `Sources:\n${numbered}\n\nReturn JSON memories with text, memoryType, quote, confidence, sensitivity.`,
        },
      ],
      schemaDescription:
        '{ "memories": [ { "text": string, "memoryType": "semantic|episodic|...", "quote": string, "confidence"?: number, "sensitivity"?: "none"|... } ] }',
      parse: (raw) => llmMemorySchema.parse(JSON.parse(raw)),
    });

    const { kept, dropped } = filterGroundedByQuote(data.memories, corpus);
    let inserted = 0;
    for (const m of kept) {
      const span = sample.find((s) => s.text.includes(m.quote.trim()));
      await this.memories.insertBiographical({
        personaId,
        memoryType: m.memoryType,
        text: m.text,
        knowledgeClass: "C",
        confidence: m.confidence ?? 0.55,
        origin: "extracted",
        sensitivity: m.sensitivity ?? "none",
        timePrecision: m.timePrecision ?? "unknown",
        evidence: {
          quote: m.quote,
          messageId: span?.messageId ?? null,
          chunkId: span?.chunkId ?? null,
        },
      });
      inserted++;
    }

    this.log.log(
      `memories persona=${personaId} inserted=${inserted} droppedFake=${dropped.length}`,
    );
    return {
      inserted,
      droppedFakeQuotes: dropped.length,
      sampleSize: sample.length,
    };
  }

  filterCandidates<T extends { quote: string }>(candidates: T[], corpus: string) {
    return filterGroundedByQuote(candidates, corpus);
  }

  private async loadExtractionSpans(
    personaId: string,
    maxSample: number,
  ): Promise<
    Array<{ text: string; messageId?: string; chunkId?: string }>
  > {
    const subjects = await this.db.query.sourceParticipants.findMany({
      where: and(
        eq(sourceParticipants.personaId, personaId),
        eq(sourceParticipants.role, "subject"),
      ),
    });
    const out: Array<{ text: string; messageId?: string; chunkId?: string }> =
      [];

    if (subjects.length > 0) {
      const messages = await this.db.query.sourceMessages.findMany({
        where: and(
          eq(sourceMessages.personaId, personaId),
          inArray(
            sourceMessages.participantId,
            subjects.map((s) => s.id),
          ),
          eq(sourceMessages.kind, "speech"),
        ),
        orderBy: (m, { asc }) => [asc(m.position)],
        limit: maxSample,
      });
      for (const m of messages) {
        out.push({ text: m.body, messageId: m.id });
      }
    }

    if (out.length < maxSample) {
      const chunks = await this.db.query.documentChunks.findMany({
        where: and(
          eq(documentChunks.personaId, personaId),
          eq(documentChunks.retrievalAllowed, true),
          inArray(documentChunks.sourceKind, ["journal", "prose", "owner_note"]),
        ),
        limit: maxSample - out.length,
      });
      for (const c of chunks) {
        out.push({ text: c.content, chunkId: c.id });
      }
    }

    return out.slice(0, maxSample);
  }
}
