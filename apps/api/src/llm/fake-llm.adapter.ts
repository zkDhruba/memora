import { Injectable } from "@nestjs/common";
import type { LlmPort } from "./llm.port";
import type {
  LlmCompleteRequest,
  LlmCompleteResult,
  LlmJsonRequest,
} from "./llm.types";
import { ProviderConsentService } from "./provider-consent.service";

/** In-memory LLM for unit/CI tests — still enforces consent. */
@Injectable()
export class FakeLlmAdapter implements LlmPort {
  constructor(private readonly consent: ProviderConsentService) {}

  replyText = "fake-llm-ok";

  async complete(request: LlmCompleteRequest): Promise<LlmCompleteResult> {
    await this.consent.assertCanCallProvider(
      request.personaId,
      request.provider,
    );
    return {
      text: this.replyText,
      model: request.model || "fake",
      provider: request.provider,
      inputTokens: 1,
      outputTokens: 1,
      finishReason: "stop",
      quality: "ok",
    };
  }

  async completeJson<T>(request: LlmJsonRequest<T>): Promise<{
    data: T;
    result: LlmCompleteResult;
  }> {
    const result = await this.complete(request);
    const data = request.parse(this.replyText);
    return { data, result };
  }
}
