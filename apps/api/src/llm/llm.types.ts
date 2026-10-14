export type LlmPurpose =
  | "chat"
  | "extract_memory"
  | "extract_style"
  | "title"
  | "test";

export type LlmMessageRole = "system" | "user" | "assistant";

export type LlmMessage = {
  role: LlmMessageRole;
  content: string;
};

export type LlmCompleteRequest = {
  personaId: string;
  purpose: LlmPurpose;
  /** Allowlisted provider id (e.g. openrouter, anthropic). Must match consent. */
  provider: string;
  model: string;
  messages: LlmMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  /** Same-provider fallback only (not used by OpenRouter MVP adapter yet). */
  allowFallbackModels?: boolean;
};

export type LlmCompleteResult = {
  text: string;
  model: string;
  provider: string;
  inputTokens: number | null;
  outputTokens: number | null;
  finishReason: string | null;
  quality: "ok" | "degraded";
};

export type LlmJsonRequest<T> = LlmCompleteRequest & {
  /** Hint appended so the model returns JSON matching the schema. */
  schemaDescription: string;
  parse: (raw: string) => T;
};
