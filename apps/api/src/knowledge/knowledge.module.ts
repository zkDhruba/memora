import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmbeddingsModule } from "../embeddings/embeddings.module";
import { MemoryModule } from "../memory/memory.module";
import { PersonasModule } from "../personas/personas.module";
import { PersonalityModule } from "../personality/personality.module";
import { KnowledgeController } from "./knowledge.controller";
import { KnowledgeService } from "./knowledge.service";

@Module({
  imports: [
    AuthModule,
    PersonasModule,
    EmbeddingsModule,
    PersonalityModule,
    MemoryModule,
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
