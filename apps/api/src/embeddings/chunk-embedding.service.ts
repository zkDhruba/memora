import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  chunkEmbeddings,
  documentChunks,
  type MemoraDb,
} from "@memora/db";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { DB } from "../db/db.tokens";
import { env } from "../config/env";
import { EMBEDDING_PORT, type EmbeddingPort } from "./embedding.port";

export type NearestChunkHit = {
  chunkId: string;
  content: string;
  header: string | null;
  distance: number;
  speakerRole: string;
  sourceKind: string;
};

/**
 * Embeds eligible chunks and runs cosine nearest-neighbor queries (3.2).
 * Eligibility: retrieval_allowed and (subject speaker or journal/prose/owner_note).
 */
@Injectable()
export class ChunkEmbeddingService {
  private readonly log = new Logger(ChunkEmbeddingService.name);

  constructor(
    @Inject(DB) private readonly db: MemoraDb,
    @Inject(EMBEDDING_PORT) private readonly embeddings: EmbeddingPort,
  ) {}

  /** Embed text for storage: header + content when header present. */
  embedText(header: string | null, content: string): string {
    if (header?.trim()) return `${header.trim()}\n${content}`;
    return content;
  }

  async listEligibleUnembedded(personaId: string, limit = 64) {
    const model = env.embeddings.model();
    const rows = await this.db
      .select({
        id: documentChunks.id,
        header: documentChunks.header,
        content: documentChunks.content,
        speakerRole: documentChunks.speakerRole,
        sourceKind: documentChunks.sourceKind,
      })
      .from(documentChunks)
      .leftJoin(
        chunkEmbeddings,
        and(
          eq(chunkEmbeddings.chunkId, documentChunks.id),
          eq(chunkEmbeddings.model, model),
        ),
      )
      .where(
        and(
          eq(documentChunks.personaId, personaId),
          eq(documentChunks.retrievalAllowed, true),
          isNull(chunkEmbeddings.chunkId),
          or(
            eq(documentChunks.speakerRole, "subject"),
            eq(documentChunks.speakerRole, "document"),
            inArray(documentChunks.sourceKind, [
              "journal",
              "prose",
              "owner_note",
            ]),
          ),
        ),
      )
      .limit(limit);
    return rows;
  }

  async countEligibleUnembedded(personaId: string): Promise<number> {
    const model = env.embeddings.model();
    const rows = await this.db.execute(sql`
      select count(*)::int as n
      from document_chunks c
      left join chunk_embeddings e
        on e.chunk_id = c.id and e.model = ${model}
      where c.persona_id = ${personaId}::uuid
        and c.retrieval_allowed = true
        and e.chunk_id is null
        and (
          c.speaker_role = 'subject'
          or c.speaker_role = 'document'
          or c.source_kind in ('journal', 'prose', 'owner_note')
        )
    `);
    const list = Array.isArray(rows)
      ? rows
      : ((rows as { rows?: Array<{ n: number }> }).rows ?? []);
    return Number(list[0]?.n ?? 0);
  }

  /**
   * Embed eligible chunks in batches until none remain or maxBatches is hit.
   * Rebuild/UI and the worker must call this with a high enough maxBatches
   * (or repeatedly) — a single 32/64 batch leaves huge WhatsApp corpora dark.
   */
  async embedPersonaChunks(
    personaId: string,
    opts?: { limit?: number; maxBatches?: number },
  ): Promise<{ embedded: number; remaining: number; model: string }> {
    const model = env.embeddings.model();
    const batchSize = opts?.limit ?? 32;
    const maxBatches = Math.max(1, opts?.maxBatches ?? 1);
    let embedded = 0;

    for (let batchNo = 0; batchNo < maxBatches; batchNo++) {
      const batch = await this.listEligibleUnembedded(personaId, batchSize);
      if (batch.length === 0) break;

      const texts = batch.map((c) => this.embedText(c.header, c.content));
      const result = await this.embeddings.embed({
        personaId,
        texts,
        model,
      });

      for (let i = 0; i < batch.length; i++) {
        const chunk = batch[i]!;
        const vector = result.vectors[i]!;
        await this.db
          .insert(chunkEmbeddings)
          .values({
            chunkId: chunk.id,
            model,
            dims: result.dims,
            embedding: vector,
          })
          .onConflictDoUpdate({
            target: [chunkEmbeddings.chunkId, chunkEmbeddings.model],
            set: {
              dims: result.dims,
              embedding: vector,
            },
          });
      }

      embedded += batch.length;
      this.log.log(
        `embedded batch ${batchNo + 1}/${maxBatches} size=${batch.length} total=${embedded} persona=${personaId}`,
      );
    }

    const remaining = await this.countEligibleUnembedded(personaId);
    return { embedded, remaining, model };
  }

  /**
   * Cosine nearest neighbors for a query vector, persona-scoped.
   * Uses pgvector `<=>` (cosine distance). Lower is closer.
   */
  async nearestByVector(input: {
    personaId: string;
    vector: number[];
    limit?: number;
    model?: string;
  }): Promise<NearestChunkHit[]> {
    const model = input.model ?? env.embeddings.model();
    const limit = input.limit ?? 8;
    // pgvector literal — floats from our embedder only.
    const vecSql = sql.raw(
      `'[${input.vector.map((n) => Number(n)).join(",")}]'::vector`,
    );

    const rows = await this.db.execute(sql`
      select
        c.id as chunk_id,
        c.content,
        c.header,
        c.speaker_role,
        c.source_kind,
        (e.embedding <=> ${vecSql}) as distance
      from chunk_embeddings e
      inner join document_chunks c on c.id = e.chunk_id
      where c.persona_id = ${input.personaId}::uuid
        and c.retrieval_allowed = true
        and e.model = ${model}
      order by e.embedding <=> ${vecSql}
      limit ${limit}
    `);

    const list = Array.isArray(rows)
      ? rows
      : ((rows as { rows?: unknown[] }).rows ?? []);
    return (list as Array<Record<string, unknown>>).map((r) => ({
      chunkId: String(r.chunk_id),
      content: String(r.content),
      header: r.header == null ? null : String(r.header),
      distance: Number(r.distance),
      speakerRole: String(r.speaker_role),
      sourceKind: String(r.source_kind),
    }));
  }

  async nearestByText(input: {
    personaId: string;
    query: string;
    limit?: number;
  }): Promise<NearestChunkHit[]> {
    const embedded = await this.embeddings.embed({
      personaId: input.personaId,
      texts: [input.query],
    });
    const vector = embedded.vectors[0];
    if (!vector) return [];
    return this.nearestByVector({
      personaId: input.personaId,
      vector,
      limit: input.limit,
      model: env.embeddings.model(),
    });
  }
}
