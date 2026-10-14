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

  async embedPersonaChunks(
    personaId: string,
    opts?: { limit?: number },
  ): Promise<{ embedded: number; model: string }> {
    const model = env.embeddings.model();
    const batch = await this.listEligibleUnembedded(
      personaId,
      opts?.limit ?? 32,
    );
    if (batch.length === 0) {
      return { embedded: 0, model };
    }

    const texts = batch.map((c) => this.embedText(c.header, c.content));
    const result = await this.embeddings.embed({
      personaId,
      texts,
      model,
    });

    // Persist under our configured model id (providers may strip the vendor prefix).
    const storeModel = model;
    for (let i = 0; i < batch.length; i++) {
      const chunk = batch[i]!;
      const vector = result.vectors[i]!;
      await this.db
        .insert(chunkEmbeddings)
        .values({
          chunkId: chunk.id,
          model: storeModel,
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

    this.log.log(
      `embedded ${batch.length} chunks for persona ${personaId} model=${storeModel}`,
    );
    return { embedded: batch.length, model: storeModel };
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
