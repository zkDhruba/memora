import { Injectable } from "@nestjs/common";
import type { LlmPort } from "./llm.port";
import type {
  LlmCompleteRequest,
  LlmCompleteResult,
  LlmJsonRequest,
  LlmStreamChunk,
  LlmStreamRequest,
} from "./llm.types";
import { ProviderConsentService } from "./provider-consent.service";

/** In-memory LLM for unit/CI tests — still enforces consent. */
@Injectable()
export class FakeLlmAdapter implements LlmPort {
  constructor(private readonly consent: ProviderConsentService) {}

  replyText = "fake-llm-ok";
  /** Delay between token yields (ms) — use >0 to test abort mid-stream. */
  streamDelayMs = 0;

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

  async *stream(request: LlmStreamRequest): AsyncIterable<LlmStreamChunk> {
    await this.consent.assertCanCallProvider(
      request.personaId,
      request.provider,
    );
    const full = this.replyText;
    let assembled = "";
    let aborted = false;
    for (const ch of full) {
      if (request.signal?.aborted) {
        aborted = true;
        break;
      }
      assembled += ch;
      yield { type: "token", text: ch };
      if (this.streamDelayMs > 0) {
        await new Promise((r) => setTimeout(r, this.streamDelayMs));
      }
    }
    yield {
      type: "done",
      text: assembled,
      model: request.model || "fake",
      provider: request.provider,
      inputTokens: 1,
      outputTokens: assembled.length,
      finishReason: aborted ? "abort" : "stop",
      quality: "ok",
      aborted,
    };
  }
}
