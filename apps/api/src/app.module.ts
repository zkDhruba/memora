import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { DbModule } from "./db/db.module";
import { FilesModule } from "./files/files.module";
import { HealthController } from "./health.controller";
import { JobsModule } from "./jobs/jobs.module";
import { EmbeddingsModule } from "./embeddings/embeddings.module";
import { LlmModule } from "./llm/llm.module";
import { MailModule } from "./mail/mail.module";
import { MemoryModule } from "./memory/memory.module";
import { PersonalityModule } from "./personality/personality.module";
import { PersonasModule } from "./personas/personas.module";
import { PlansModule } from "./plans/plans.module";
import { PromptModule } from "./prompt/prompt.module";
import { RedisModule } from "./redis/redis.module";
import { RetrievalModule } from "./retrieval/retrieval.module";
import { ReviewModule } from "./review/review.module";
import { ScanningModule } from "./scanning/scanning.module";
import { StorageModule } from "./storage/storage.module";

@Module({
  imports: [
    DbModule,
    RedisModule,
    MailModule,
    StorageModule,
    ScanningModule,
    JobsModule,
    LlmModule,
    EmbeddingsModule,
    AuthModule,
    PlansModule,
    PersonasModule,
    PersonalityModule,
    MemoryModule,
    RetrievalModule,
    PromptModule,
    ReviewModule,
    FilesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
