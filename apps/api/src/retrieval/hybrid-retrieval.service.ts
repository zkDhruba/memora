import { Inject, Injectable } from "@nestjs/common";
import { memories, type MemoraDb } from "@memora/db";
import { and, eq, sql } from "drizzle-orm";
import { DB } from "../db/db.tokens";
import { env } from "../config/env";
import { EMBEDDING_PORT, type EmbeddingPort } from "../embeddings/embedding.port";
import { visibleContentAudiences } from "./audience-filter";
import type { PersonaScope } from "./persona-scope";
import {
  expandQueryForRetrieval,
  keywordSearchTokens,
  scorePassageOverlap,
} from "./query-expand";
import { rrfTopIds } from "./rrf";

export type RetrievedChunk = {
  chunkId: string;
  content: string;
  header: string | null;
  score: number;
  speakerRole: string;
  sourceKind: string;
  audience: string;
  fileId: string;
};

export type RetrievedMemory = {
  memoryId: string;
  text: string;
  score: number;
  audience: string;
  memoryType: string;
  knowledgeClass: string;
};

export type HybridRetrievalResult = {
  chunks: RetrievedChunk[];
  memories: RetrievedMemory[];
};

const VECTOR_CANDIDATES = 30;
const FTS_CANDIDATES = 30;
const KEYWORD_CANDIDATES = 30;
const DEFAULT_CHUNK_LIMIT = 8;
const DEFAULT_MEMORY_LIMIT = 6;

/**
 * Persona-scoped hybrid retrieval (docs/09): vector + FTS → RRF,
 * with audience and speaker filters in SQL (not post-only).
 */
@Injectable()
export class HybridRetrievalService {
  constructor(
    @Inject(DB) private readonly db: MemoraDb,
    @Inject(EMBEDDING_PORT) private readonly embeddings: EmbeddingPort,
  ) {}

  async retrieve(
    scope: PersonaScope,
    query: string,
    opts?: {
      chunkLimit?: number;
      memoryLimit?: number;
      /** When true (or when ranked search is empty), seed recent subject chat. */
      softIdentityFallback?: boolean;
    },
  ): Promise<HybridRetrievalResult> {
    if (!scope.personaId) {
      throw new Error("PersonaScope.personaId is required");
    }
    const q = query.trim();
    if (!q) {
      return { chunks: [], memories: [] };
    }

    const chunkLimit = opts?.chunkLimit ?? DEFAULT_CHUNK_LIMIT;
    const [chunks, mems] = await Promise.all([
      this.searchChunks(scope, q, chunkLimit),
      this.searchMemories(scope, q, opts?.memoryLimit ?? DEFAULT_MEMORY_LIMIT),
    ]);

    if (
      chunks.length === 0 &&
      (opts?.softIdentityFallback || mems.length === 0)
    ) {
      const fallback = await this.recentSubjectChunks(
        scope,
        chunkLimit,
      );
      if (fallback.length > 0) {
        return { chunks: fallback, memories: mems };
      }
    }

    return { chunks, memories: mems };
  }

  /** Recency seed when FTS/vector miss soft identity questions. */
  async recentSubjectChunks(
    scope: PersonaScope,
    limit: number = DEFAULT_CHUNK_LIMIT,
  ): Promise<RetrievedChunk[]> {
    const audiences = visibleContentAudiences(scope.audience);
    const audienceSql = sql.join(
      audiences.map((a) => sql`${a}`),
      sql`, `,
    );
    const rows = await this.db.execute(sql`
      select
        c.id as chunk_id,
        c.content,
        c.header,
        c.speaker_role,
        c.source_kind,
        c.audience::text as audience,
        c.file_id
      from document_chunks c
      where c.persona_id = ${scope.personaId}::uuid
        and c.retrieval_allowed = true
        and c.speaker_role = 'subject'
        and c.audience in (${audienceSql})
      order by c.time_end desc nulls last, c.created_at desc
      limit ${limit}
    `);
    return mapChunkRows(rows).map((h, i) => ({
      ...h,
      score: 0.05 - i * 0.001,
    }));
  }

  async searchChunks(
    scope: PersonaScope,
    query: string,
    limit: number = DEFAULT_CHUNK_LIMIT,
  ): Promise<RetrievedChunk[]> {
    const audiences = visibleContentAudiences(scope.audience);
    const audienceSql = sql.join(
      audiences.map((a) => sql`${a}`),
      sql`, `,
    );
    const expanded = expandQueryForRetrieval(query);

    const [vectorHits, ftsHits, keywordHits] = await Promise.all([
      this.vectorChunkHits(scope.personaId, expanded, audiences),
      this.ftsChunkHits(scope.personaId, expanded, audienceSql),
      this.keywordChunkHits(scope.personaId, query, audienceSql),
    ]);

    // Pull a wider pool, then re-rank by lexical/synonym overlap so "Good night"
    // cannot bury a Sidr/Sidor hit that keyword search already found.
    const poolLimit = Math.max(limit * 3, 24);
    const fused = rrfTopIds(
      [
        vectorHits.map((h, i) => ({ id: h.chunkId, rank: i + 1 })),
        ftsHits.map((h, i) => ({ id: h.chunkId, rank: i + 1 })),
        keywordHits.map((h, i) => ({ id: h.chunkId, rank: i + 1 })),
      ],
      poolLimit,
    );

    const byId = new Map(
      [...vectorHits, ...ftsHits, ...keywordHits].map(
        (h) => [h.chunkId, h] as const,
      ),
    );
    const scored = fused
      .map(({ id, score }) => {
        const hit = byId.get(id);
        if (!hit) return null;
        const overlap = scorePassageOverlap(hit.content, query);
        return {
          ...hit,
          score: score + overlap * 0.02,
          overlap,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => b.overlap - a.overlap || b.score - a.score)
      .slice(0, limit);

    return scored.map(({ overlap: _o, ...hit }) => hit);
  }

  async searchMemories(
    scope: PersonaScope,
    query: string,
    limit: number = DEFAULT_MEMORY_LIMIT,
  ): Promise<RetrievedMemory[]> {
    const audiences = visibleContentAudiences(scope.audience);
    const audienceSql = sql.join(
      audiences.map((a) => sql`${a}`),
      sql`, `,
    );

    // MVP: no memory_embeddings table yet — hybrid = FTS + lexical token overlap.
    const [ftsHits, lexHits] = await Promise.all([
      this.ftsMemoryHits(scope.personaId, query, audienceSql),
      this.lexicalMemoryHits(scope.personaId, query, audiences),
    ]);

    const fused = rrfTopIds(
      [
        ftsHits.map((h, i) => ({ id: h.memoryId, rank: i + 1 })),
        lexHits.map((h, i) => ({ id: h.memoryId, rank: i + 1 })),
      ],
      limit,
    );

    const byId = new Map(
      [...ftsHits, ...lexHits].map((h) => [h.memoryId, h] as const),
    );
    const out: RetrievedMemory[] = [];
    for (const { id, score } of fused) {
      const hit = byId.get(id);
      if (!hit) continue;
      out.push({ ...hit, score });
    }
    return out;
  }

  private async vectorChunkHits(
    personaId: string,
    query: string,
    audiences: string[],
  ) {
    const embedded = await this.embeddings.embed({
      personaId,
      texts: [query],
    });
    const vector = embedded.vectors[0];
    if (!vector) return [] as Array<{
      chunkId: string;
      content: string;
      header: string | null;
      speakerRole: string;
      sourceKind: string;
      audience: string;
      fileId: string;
    }>;

    const model = env.embeddings.model();
    const vecSql = sql.raw(
      `'[${vector.map((n) => Number(n)).join(",")}]'::vector`,
    );
    const audienceSql = sql.join(
      audiences.map((a) => sql`${a}`),
      sql`, `,
    );

    const rows = await this.db.execute(sql`
      select
        c.id as chunk_id,
        c.content,
        c.header,
        c.speaker_role,
        c.source_kind,
        c.audience::text as audience,
        c.file_id,
        (e.embedding <=> ${vecSql}) as distance
      from chunk_embeddings e
      inner join document_chunks c on c.id = e.chunk_id
      where c.persona_id = ${personaId}::uuid
        and c.retrieval_allowed = true
        and c.speaker_role <> 'other'
        and c.audience in (${audienceSql})
        and e.model = ${model}
      order by e.embedding <=> ${vecSql}
      limit ${VECTOR_CANDIDATES}
    `);

    return mapChunkRows(rows);
  }

  private async ftsChunkHits(
    personaId: string,
    query: string,
    audienceSql: ReturnType<typeof sql.join>,
  ) {
    // content_tsv is built with 'simple' (Bangla-safe); match with the same config.
    const rows = await this.db.execute(sql`
      select
        c.id as chunk_id,
        c.content,
        c.header,
        c.speaker_role,
        c.source_kind,
        c.audience::text as audience,
        c.file_id,
        ts_rank(c.content_tsv, q) as rank
      from document_chunks c,
           plainto_tsquery('simple', ${query}) q
      where c.persona_id = ${personaId}::uuid
        and c.retrieval_allowed = true
        and c.speaker_role <> 'other'
        and c.audience in (${audienceSql})
        and c.content_tsv is not null
        and c.content_tsv @@ q
      order by rank desc
      limit ${FTS_CANDIDATES}
    `);

    return mapChunkRows(rows);
  }

  /**
   * Exact-ish substring hits for expanded tokens (Sidr→Sidor, 2007, baba→bap).
   * Catches romanized typos that FTS/vector miss.
   */
  private async keywordChunkHits(
    personaId: string,
    query: string,
    audienceSql: ReturnType<typeof sql.join>,
  ) {
    const variants = keywordSearchTokens(query);
    if (variants.length === 0) return [];

    // Word-ish boundaries so "sidr" does not need spaces and "2007" stays exact.
    const rows = await this.db.execute(sql`
      select
        c.id as chunk_id,
        c.content,
        c.header,
        c.speaker_role,
        c.source_kind,
        c.audience::text as audience,
        c.file_id,
        (
          ${sql.join(
            variants.map(
              (v) =>
                sql`(case when c.content ~* ${"(^|[^[:alnum:]])" + v + "([^[:alnum:]]|$)"} then 1 else 0 end)`,
            ),
            sql` + `,
          )}
        ) as hit_count
      from document_chunks c
      where c.persona_id = ${personaId}::uuid
        and c.retrieval_allowed = true
        and c.speaker_role <> 'other'
        and c.audience in (${audienceSql})
        and (
          ${sql.join(
            variants.map(
              (v) =>
                sql`c.content ~* ${"(^|[^[:alnum:]])" + v + "([^[:alnum:]]|$)"}`,
            ),
            sql` or `,
          )}
        )
      order by hit_count desc, length(c.content) asc
      limit ${KEYWORD_CANDIDATES}
    `);

    return mapChunkRows(rows);
  }

  private async ftsMemoryHits(
    personaId: string,
    query: string,
    audienceSql: ReturnType<typeof sql.join>,
  ) {
    const rows = await this.db.execute(sql`
      select
        m.id as memory_id,
        m.text,
        m.audience::text as audience,
        m.memory_type,
        m.knowledge_class,
        ts_rank(to_tsvector('simple', m.text), q) as rank
      from memories m,
           plainto_tsquery('simple', ${query}) q
      where m.persona_id = ${personaId}::uuid
        and m.domain = 'biographical'
        and m.status = 'confirmed'
        and m.audience in (${audienceSql})
        and to_tsvector('simple', m.text) @@ q
      order by rank desc
      limit ${FTS_CANDIDATES}
    `);

    return mapMemoryRows(rows);
  }

  private async lexicalMemoryHits(
    personaId: string,
    query: string,
    audiences: string[],
  ) {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    const candidates = await this.db.query.memories.findMany({
      where: and(
        eq(memories.personaId, personaId),
        eq(memories.domain, "biographical"),
        eq(memories.status, "confirmed"),
      ),
      limit: 80,
    });

    const allowed = new Set(audiences);
    const scored = candidates
      .filter((m) => allowed.has(m.audience))
      .map((m) => {
        const lower = m.text.toLowerCase();
        let hits = 0;
        for (const t of tokens) {
          if (lower.includes(t)) hits += 1;
        }
        return { m, hits };
      })
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, FTS_CANDIDATES);

    return scored.map(({ m }) => ({
      memoryId: m.id,
      text: m.text,
      audience: m.audience,
      memoryType: m.memoryType,
      knowledgeClass: m.knowledgeClass,
    }));
  }
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 12);
}

function mapChunkRows(rows: unknown) {
  const list = Array.isArray(rows)
    ? rows
    : ((rows as { rows?: unknown[] }).rows ?? []);
  return (list as Array<Record<string, unknown>>).map((r) => ({
    chunkId: String(r.chunk_id),
    content: String(r.content),
    header: r.header == null ? null : String(r.header),
    speakerRole: String(r.speaker_role),
    sourceKind: String(r.source_kind),
    audience: String(r.audience),
    fileId: String(r.file_id),
  }));
}

function mapMemoryRows(rows: unknown) {
  const list = Array.isArray(rows)
    ? rows
    : ((rows as { rows?: unknown[] }).rows ?? []);
  return (list as Array<Record<string, unknown>>).map((r) => ({
    memoryId: String(r.memory_id),
    text: String(r.text),
    audience: String(r.audience),
    memoryType: String(r.memory_type),
    knowledgeClass: String(r.knowledge_class),
  }));
}
