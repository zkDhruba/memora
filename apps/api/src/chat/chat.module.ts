import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LlmModule } from "../llm/llm.module";
import { MemoryModule } from "../memory/memory.module";
import { PersonasModule } from "../personas/personas.module";
import { PlansModule } from "../plans/plans.module";
import { PromptModule } from "../prompt/prompt.module";
import { RetrievalModule } from "../retrieval/retrieval.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

@Module({
  imports: [
    AuthModule,
    PersonasModule,
    LlmModule,
    PromptModule,
    RetrievalModule,
    MemoryModule,
    PlansModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
