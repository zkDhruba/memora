import "../src/load-env";
import {
  createDb,
  documentChunks,
  memories,
  personas,
  personalityTraits,
  sourceMessages,
  sourceParticipants,
} from "@memora/db";
import { and, count, desc, eq, sql } from "drizzle-orm";

async function main() {
  const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
  try {
    const rows = await db
      .select()
      .from(personas)
      .where(sql`deleted_at is null`)
      .orderBy(desc(personas.updatedAt))
      .limit(8);

    for (const p of rows) {
      const [c] = await db
        .select({ n: count() })
        .from(documentChunks)
        .where(eq(documentChunks.personaId, p.id));
      const emb = await db.execute(sql`
        select count(*)::int as n
        from chunk_embeddings e
        join document_chunks c on c.id = e.chunk_id
        where c.persona_id = ${p.id}::uuid
      `);
      const embList = Array.isArray(emb)
        ? emb
        : ((emb as { rows: Array<{ n: number }> }).rows ?? []);
      const [ra] = await db
        .select({ n: count() })
        .from(documentChunks)
        .where(
          and(
            eq(documentChunks.personaId, p.id),
            eq(documentChunks.retrievalAllowed, true),
          ),
        );
      const tc = await db
        .select({ status: personalityTraits.status, n: count() })
        .from(personalityTraits)
        .where(eq(personalityTraits.personaId, p.id))
        .groupBy(personalityTraits.status);
      const mc = await db
        .select({
          status: memories.status,
          domain: memories.domain,
          n: count(),
        })
        .from(memories)
        .where(eq(memories.personaId, p.id))
        .groupBy(memories.status, memories.domain);
      const subjects = await db
        .select()
        .from(sourceParticipants)
        .where(
          and(
            eq(sourceParticipants.personaId, p.id),
            eq(sourceParticipants.role, "subject"),
          ),
        );
      const [msg] = await db
        .select({ n: count() })
        .from(sourceMessages)
        .where(eq(sourceMessages.personaId, p.id));
      const sampleMem = await db.query.memories.findMany({
        where: eq(memories.personaId, p.id),
        limit: 5,
      });
      const sampleTrait = await db.query.personalityTraits.findMany({
        where: eq(personalityTraits.personaId, p.id),
        limit: 5,
      });
      const sampleChunk = await db.query.documentChunks.findMany({
        where: and(
          eq(documentChunks.personaId, p.id),
          eq(documentChunks.retrievalAllowed, true),
        ),
        limit: 2,
      });

      console.log(
        JSON.stringify(
          {
            id: p.id,
            name: p.displayName,
            bioLen: (p.biography || "").length,
            providerKey: p.providerKey,
            chunks: Number(c?.n ?? 0),
            retrievalAllowed: Number(ra?.n ?? 0),
            embeddings: embList[0]?.n ?? 0,
            traitsByStatus: tc,
            memoriesByStatus: mc,
            subjects: subjects.map((s) => s.rawLabel),
            sourceMessages: Number(msg?.n ?? 0),
            sampleMem: sampleMem.map((m) => ({
              status: m.status,
              text: m.text.slice(0, 100),
            })),
            sampleTrait: sampleTrait.map((t) => ({
              status: t.status,
              class: t.knowledgeClass,
              value: t.value.slice(0, 80),
            })),
            sampleChunk: sampleChunk.map((ch) => ch.content.slice(0, 100)),
          },
          null,
          2,
        ),
      );
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
