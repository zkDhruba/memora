import type {
  LlmCompleteRequest,
  LlmCompleteResult,
  LlmJsonRequest,
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
}

export const LLM_PORT = Symbol("LLM_PORT");
