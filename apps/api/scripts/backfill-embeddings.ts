/**
 * Backfill embeddings for a persona until remaining=0 (or maxRounds).
 * Usage: pnpm exec tsx scripts/backfill-embeddings.ts <personaId>
 */
import "../src/load-env";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { ChunkEmbeddingService } from "../src/embeddings/chunk-embedding.service";

async function main() {
  const personaId = process.argv[2];
  if (!personaId) {
    console.error("Usage: tsx scripts/backfill-embeddings.ts <personaId>");
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });
  try {
    const embedder = app.get(ChunkEmbeddingService);
    let round = 0;
    const maxRounds = 40;
    let total = 0;
    while (round < maxRounds) {
      round++;
      const { embedded, remaining, model } = await embedder.embedPersonaChunks(
        personaId,
        { limit: 64, maxBatches: 25 },
      );
      total += embedded;
      console.log(
        JSON.stringify({
          round,
          embedded,
          total,
          remaining,
          model,
        }),
      );
      if (remaining === 0 || embedded === 0) break;
    }
    const remaining = await embedder.countEligibleUnembedded(personaId);
    console.log(JSON.stringify({ done: remaining === 0, total, remaining }));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
