import { Module } from "@nestjs/common";
import { LLM_PORT } from "./llm.port";
import { OpenRouterAdapter } from "./openrouter.adapter";
import { ProviderConsentService } from "./provider-consent.service";

@Module({
  providers: [
    ProviderConsentService,
    OpenRouterAdapter,
    {
      provide: LLM_PORT,
      useExisting: OpenRouterAdapter,
    },
  ],
  exports: [LLM_PORT, ProviderConsentService, OpenRouterAdapter],
})
export class LlmModule {}
