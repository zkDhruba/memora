import { Module } from "@nestjs/common";
import { LlmModule } from "../llm/llm.module";
import { ConversationalMemoryWriter } from "./conversational-memory-writer";
import { MemoryExtractService } from "./memory-extract.service";
import { MemoryRepository } from "./memory.repository";

@Module({
  imports: [LlmModule],
  providers: [
    MemoryRepository,
    MemoryExtractService,
    ConversationalMemoryWriter,
  ],
  exports: [
    MemoryRepository,
    MemoryExtractService,
    ConversationalMemoryWriter,
  ],
})
export class MemoryModule {}
