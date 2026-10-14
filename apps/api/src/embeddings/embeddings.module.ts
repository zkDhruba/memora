import { Module } from "@nestjs/common";
import { LlmModule } from "../llm/llm.module";
import { ChunkEmbeddingService } from "./chunk-embedding.service";
import { EMBEDDING_PORT } from "./embedding.port";
import { OpenRouterEmbeddingAdapter } from "./openrouter-embedding.adapter";

@Module({
  imports: [LlmModule],
  providers: [
    OpenRouterEmbeddingAdapter,
    {
      provide: EMBEDDING_PORT,
      useExisting: OpenRouterEmbeddingAdapter,
    },
    ChunkEmbeddingService,
  ],
  exports: [EMBEDDING_PORT, ChunkEmbeddingService],
})
export class EmbeddingsModule {}
