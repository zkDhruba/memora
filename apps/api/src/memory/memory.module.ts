import { Module } from "@nestjs/common";
import { LlmModule } from "../llm/llm.module";
import { MemoryExtractService } from "./memory-extract.service";
import { MemoryRepository } from "./memory.repository";

@Module({
  imports: [LlmModule],
  providers: [MemoryRepository, MemoryExtractService],
  exports: [MemoryRepository, MemoryExtractService],
})
export class MemoryModule {}
