import { Module } from "@nestjs/common";
import { LlmModule } from "../llm/llm.module";
import { TraitExtractService } from "./trait-extract.service";

@Module({
  imports: [LlmModule],
  providers: [TraitExtractService],
  exports: [TraitExtractService],
})
export class PersonalityModule {}
