import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  personalityEvidence,
  personalityProfiles,
  personalityTraits,
  sourceMessages,
  sourceParticipants,
  sourceThreads,
  type MemoraDb,
} from "@memora/db";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { newId } from "../common/ids";
import { env } from "../config/env";
import { DB } from "../db/db.tokens";
import { LLM_PORT, type LlmPort } from "../llm/llm.port";
import { filterGroundedTraits } from "./quote-check";
import {
  computeStyleStats,
  styleStatsToTraitDrafts,
  type StyleStatMessage,
} from "./style-stats";

const FACETS = [
  "formality",
  "sentence_length",
  "lexicon",
  "greeting",
  "farewell",
  "humor",
  "emotion",
  "habit",
  "interest_expression",
  "storytelling",
  "code_switching",
  "address_term",
] as const;

const llmTraitSchema = z.object({
  traits: z.array(
    z.object({
      facet: z.enum(FACETS),
      value: z.string().min(1).max(240),
      quote: z.string().min(2).max(280),
      confidence: z.number().min(0).max(1).optional(),
    }),
  ),
});

export type TraitExtractResult = {
  styleStats: ReturnType<typeof computeStyleStats>;
  classBInserted: number;
  classCInserted: number;
  classCDroppedFakeQuotes: number;
  sampleSize: number;
};

@Injectable()
export class TraitExtractService {
  private readonly log = new Logger(TraitExtractService.name);

  constructor(
    @Inject(DB) private readonly db: MemoraDb,
    @Inject(LLM_PORT) private readonly llm: LlmPort,
  ) {}

  /**
   * Compute style stats + insert class-B drafts; optionally call LLM for
   * class-C drafts and drop any whose quote is not in the sample corpus.
   */
  async extractForPersona(
    personaId: string,
    opts?: { skipLlm?: boolean; maxSample?: number },
  ): Promise<TraitExtractResult> {
    const subjectMessages = await this.loadSubjectMessages(personaId);
    const stats = computeStyleStats(subjectMessages);

    await this.db
      .insert(personalityProfiles)
      .values({
        personaId,
        version: 1,
        compiledCard: {
          limitedEvidence: stats.limitedEvidence,
          languages: [],
        },
        styleStats: stats,
      })
      .onConflictDoUpdate({
        target: personalityProfiles.personaId,
        set: {
          styleStats: stats,
          updatedAt: new Date(),
        },
      });

    const corpus = subjectMessages.map((m) => m.body).join("\n");
    const classB = styleStatsToTraitDrafts(stats);
    const groundedB = filterGroundedTraits(classB, corpus);
    let classBInserted = 0;
    for (const t of groundedB.kept) {
      await this.insertTrait({
        personaId,
        facet: t.facet,
        value: t.value,
        knowledgeClass: "B",
        confidence: t.confidence,
        quote: t.quote,
        messageId: subjectMessages.find((m) => m.body.includes(t.quote))?.id,
      });
      classBInserted++;
    }

    let classCInserted = 0;
    let classCDroppedFakeQuotes = 0;
    const maxSample = opts?.maxSample ?? 40;
    const sample = stratifySample(subjectMessages, maxSample);
    const sampleCorpus = sample.map((m) => m.body).join("\n");

    if (!opts?.skipLlm && sample.length > 0) {
      const { kept, dropped } = await this.extractClassC(
        personaId,
        sample,
        sampleCorpus,
      );
      classCDroppedFakeQuotes = dropped.length;
      for (const t of kept) {
        await this.insertTrait({
          personaId,
          facet: t.facet,
          value: t.value,
          knowledgeClass: "C",
          confidence: t.confidence ?? 0.6,
          quote: t.quote,
          messageId: sample.find((m) =>
            m.body.includes(t.quote.trim()),
          )?.id,
        });
        classCInserted++;
      }
    }

    this.log.log(
      `traits persona=${personaId} B=${classBInserted} C=${classCInserted} droppedFake=${classCDroppedFakeQuotes}`,
    );

    return {
      styleStats: stats,
      classBInserted,
      classCInserted,
      classCDroppedFakeQuotes,
      sampleSize: sample.length,
    };
  }

  /** Test helper: apply quote filter to LLM-shaped candidates. */
  filterCandidates<T extends { quote: string; value: string }>(
    candidates: T[],
    corpus: string,
  ) {
    return filterGroundedTraits(candidates, corpus);
  }

  private async extractClassC(
    personaId: string,
    sample: StyleStatMessage[],
    corpus: string,
  ) {
    const numbered = sample
      .map((m, i) => `[${i + 1}] ${m.body}`)
      .join("\n");

    const { data } = await this.llm.completeJson({
      personaId,
      purpose: "extract_style",
      provider: "openrouter",
      model: env.openrouter.defaultModel(),
      temperature: 0.2,
      maxOutputTokens: 1200,
      messages: [
        {
          role: "system",
          content:
            "You extract communication-style traits for a persona simulation. " +
            "Only use the subject's messages. Each trait MUST include a quote that is an exact substring of one message. " +
            "Do not invent quotes. Prefer class-C inferences (humor, emotion, formality, storytelling).",
        },
        {
          role: "user",
          content:
            `Messages:\n${numbered}\n\nReturn JSON: {"traits":[{"facet":"...","value":"...","quote":"...","confidence":0.0}]}`,
        },
      ],
      schemaDescription:
        '{ "traits": [ { "facet": "formality|humor|emotion|...", "value": string, "quote": string, "confidence"?: number } ] }',
      parse: (raw) => llmTraitSchema.parse(JSON.parse(raw)),
    });

    return filterGroundedTraits(data.traits, corpus);
  }

  private async insertTrait(input: {
    personaId: string;
    facet: (typeof FACETS)[number];
    value: string;
    knowledgeClass: "B" | "C";
    confidence: number;
    quote: string;
    messageId?: string;
  }) {
    const traitId = newId();
    await this.db.insert(personalityTraits).values({
      id: traitId,
      personaId: input.personaId,
      facet: input.facet,
      value: input.value,
      knowledgeClass: input.knowledgeClass,
      // Class B = measured stats (safe to use in chat). Class C needs review.
      status: input.knowledgeClass === "B" ? "confirmed" : "pending_review",
      confidence: input.confidence,
      audience: "any",
      polarity: "observed",
    });
    await this.db.insert(personalityEvidence).values({
      id: newId(),
      traitId,
      messageId: input.messageId ?? null,
      chunkId: null,
      quote: input.quote.slice(0, 280),
    });
  }

  private async loadSubjectMessages(
    personaId: string,
  ): Promise<StyleStatMessage[]> {
    const subjects = await this.db.query.sourceParticipants.findMany({
      where: and(
        eq(sourceParticipants.personaId, personaId),
        eq(sourceParticipants.role, "subject"),
      ),
    });
    if (subjects.length === 0) return [];

    const subjectIds = subjects.map((s) => s.id);
    const threads = await this.db.query.sourceThreads.findMany({
      where: eq(sourceThreads.personaId, personaId),
    });
    const threadIds = threads.map((t) => t.id);
    if (threadIds.length === 0) return [];

    const messages = await this.db.query.sourceMessages.findMany({
      where: and(
        eq(sourceMessages.personaId, personaId),
        inArray(sourceMessages.threadId, threadIds),
        inArray(sourceMessages.participantId, subjectIds),
        eq(sourceMessages.kind, "speech"),
      ),
      orderBy: (m, { asc }) => [asc(m.sentAt), asc(m.position)],
    });

    // Mark first/last per thread by position
    const byThread = new Map<string, typeof messages>();
    for (const m of messages) {
      const list = byThread.get(m.threadId) ?? [];
      list.push(m);
      byThread.set(m.threadId, list);
    }
    const out: StyleStatMessage[] = [];
    for (const list of byThread.values()) {
      const sorted = [...list].sort((a, b) => a.position - b.position);
      sorted.forEach((m, i) => {
        out.push({
          id: m.id,
          body: m.body,
          isThreadFirst: i === 0,
          isThreadLast: i === sorted.length - 1,
        });
      });
    }
    return out;
  }
}

function stratifySample(
  messages: StyleStatMessage[],
  max: number,
): StyleStatMessage[] {
  if (messages.length <= max) return messages;
  const step = messages.length / max;
  const picked: StyleStatMessage[] = [];
  for (let i = 0; i < max; i++) {
    picked.push(messages[Math.min(messages.length - 1, Math.floor(i * step))]!);
  }
  return picked;
}
