import { Module } from "@nestjs/common";
import { EmbeddingsModule } from "../embeddings/embeddings.module";
import { HybridRetrievalService } from "./hybrid-retrieval.service";

@Module({
  imports: [EmbeddingsModule],
  providers: [HybridRetrievalService],
  exports: [HybridRetrievalService],
})
export class RetrievalModule {}
