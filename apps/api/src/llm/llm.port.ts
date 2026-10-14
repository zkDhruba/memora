import type {
  LlmCompleteRequest,
  LlmCompleteResult,
  LlmJsonRequest,
  LlmStreamChunk,
  LlmStreamRequest,
} from "./llm.types";

/**
 * Application-facing LLM port. Controllers/services never import provider SDKs.
 * Adapters (OpenRouter, Anthropic, fake) implement this.
 */
export interface LlmPort {
  complete(request: LlmCompleteRequest): Promise<LlmCompleteResult>;

  completeJson<T>(request: LlmJsonRequest<T>): Promise<{
    data: T;
    result: LlmCompleteResult;
  }>;

  /** Token stream for chat (3.8). Honors AbortSignal to stop provider spend. */
  stream(request: LlmStreamRequest): AsyncIterable<LlmStreamChunk>;
}

export const LLM_PORT = Symbol("LLM_PORT");
