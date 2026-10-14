import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { ApiException } from "../common/api-exception";
import { env } from "../config/env";
import type { LlmPort } from "./llm.port";
import type {
  LlmCompleteRequest,
  LlmCompleteResult,
  LlmJsonRequest,
  LlmStreamChunk,
  LlmStreamRequest,
} from "./llm.types";
import { ProviderConsentService } from "./provider-consent.service";

type OpenRouterChoice = {
  message?: { content?: string | null };
  finish_reason?: string | null;
};

type OpenRouterResponse = {
  id?: string;
  model?: string;
  choices?: OpenRouterChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: { message?: string; code?: number | string };
};

/** Testing / MVP adapter: OpenAI-compatible Chat Completions via OpenRouter. */
@Injectable()
export class OpenRouterAdapter implements LlmPort {
  private readonly log = new Logger(OpenRouterAdapter.name);

  constructor(
    @Inject(ProviderConsentService)
    private readonly consent: ProviderConsentService,
  ) {}

  async complete(request: LlmCompleteRequest): Promise<LlmCompleteResult> {
    if (request.provider !== "openrouter") {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "PROVIDER_UNSUPPORTED",
        `OpenRouter adapter cannot call provider "${request.provider}".`,
        { provider: request.provider },
      );
    }

    await this.consent.assertCanCallProvider(
      request.personaId,
      request.provider,
    );

    const apiKey = env.openrouter.apiKey();
    if (!apiKey) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "LLM_NOT_CONFIGURED",
        "OPENROUTER_API_KEY is not set.",
      );
    }

    const body = {
      model: request.model || env.openrouter.defaultModel(),
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: request.maxOutputTokens ?? 1024,
      temperature: request.temperature ?? 0.4,
    };

    let res: Response;
    try {
      res = await fetch(env.openrouter.baseUrl(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": env.openrouter.httpReferer(),
          "X-Title": env.openrouter.appTitle(),
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.log.error(
        `OpenRouter network error: ${(err as Error).message}`,
      );
      throw new ApiException(
        HttpStatus.BAD_GATEWAY,
        "LLM_UPSTREAM_ERROR",
        "Failed to reach OpenRouter.",
        { cause: (err as Error).message },
      );
    }

    const rawText = await res.text();
    let parsed: OpenRouterResponse;
    try {
      parsed = JSON.parse(rawText) as OpenRouterResponse;
    } catch {
      throw new ApiException(
        HttpStatus.BAD_GATEWAY,
        "LLM_UPSTREAM_ERROR",
        "OpenRouter returned non-JSON.",
        { status: res.status },
      );
    }

    if (!res.ok) {
      const msg =
        parsed.error?.message ??
        `OpenRouter HTTP ${res.status}`;
      this.log.warn(`OpenRouter error: ${msg}`);
      throw new ApiException(
        HttpStatus.BAD_GATEWAY,
        "LLM_UPSTREAM_ERROR",
        msg,
        { status: res.status, provider: "openrouter" },
      );
    }

    const text = parsed.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      throw new ApiException(
        HttpStatus.BAD_GATEWAY,
        "LLM_EMPTY_RESPONSE",
        "OpenRouter returned an empty completion.",
      );
    }

    return {
      text,
      model: parsed.model ?? body.model,
      provider: "openrouter",
      inputTokens: parsed.usage?.prompt_tokens ?? null,
      outputTokens: parsed.usage?.completion_tokens ?? null,
      finishReason: parsed.choices?.[0]?.finish_reason ?? null,
      quality: "ok",
    };
  }

  async *stream(request: LlmStreamRequest): AsyncIterable<LlmStreamChunk> {
    if (request.provider !== "openrouter") {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "PROVIDER_UNSUPPORTED",
        `OpenRouter adapter cannot call provider "${request.provider}".`,
        { provider: request.provider },
      );
    }

    await this.consent.assertCanCallProvider(
      request.personaId,
      request.provider,
    );

    const apiKey = env.openrouter.apiKey();
    if (!apiKey) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "LLM_NOT_CONFIGURED",
        "OPENROUTER_API_KEY is not set.",
      );
    }

    const model = request.model || env.openrouter.defaultModel();
    const body = {
      model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: request.maxOutputTokens ?? 1024,
      temperature: request.temperature ?? 0.4,
      stream: true,
    };

    let res: Response;
    try {
      res = await fetch(env.openrouter.baseUrl(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": env.openrouter.httpReferer(),
          "X-Title": env.openrouter.appTitle(),
        },
        body: JSON.stringify(body),
        signal: request.signal,
      });
    } catch (err) {
      if (request.signal?.aborted) {
        yield {
          type: "done",
          text: "",
          model,
          provider: "openrouter",
          inputTokens: null,
          outputTokens: null,
          finishReason: "abort",
          quality: "degraded",
          aborted: true,
        };
        return;
      }
      this.log.error(`OpenRouter stream network error: ${(err as Error).message}`);
      throw new ApiException(
        HttpStatus.BAD_GATEWAY,
        "LLM_UPSTREAM_ERROR",
        "Failed to reach OpenRouter.",
        { cause: (err as Error).message },
      );
    }

    if (!res.ok || !res.body) {
      const raw = await res.text().catch(() => "");
      throw new ApiException(
        HttpStatus.BAD_GATEWAY,
        "LLM_UPSTREAM_ERROR",
        `OpenRouter stream HTTP ${res.status}`,
        { status: res.status, body: raw.slice(0, 200) },
      );
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assembled = "";
    let aborted = false;
    let finishReason: string | null = null;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;

    try {
      while (true) {
        if (request.signal?.aborted) {
          aborted = true;
          await reader.cancel().catch(() => undefined);
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") continue;
          let parsed: {
            choices?: Array<{
              delta?: { content?: string | null };
              finish_reason?: string | null;
            }>;
            usage?: {
              prompt_tokens?: number;
              completion_tokens?: number;
            };
            model?: string;
          };
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue;
          }
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            assembled += delta;
            yield { type: "token", text: delta };
          }
          if (parsed.choices?.[0]?.finish_reason) {
            finishReason = parsed.choices[0].finish_reason;
          }
          if (parsed.usage) {
            inputTokens = parsed.usage.prompt_tokens ?? inputTokens;
            outputTokens = parsed.usage.completion_tokens ?? outputTokens;
          }
        }
      }
    } catch (err) {
      if (request.signal?.aborted) {
        aborted = true;
      } else {
        throw err;
      }
    }

    yield {
      type: "done",
      text: assembled,
      model,
      provider: "openrouter",
      inputTokens,
      outputTokens,
      finishReason: aborted ? "abort" : finishReason,
      quality: aborted ? "degraded" : "ok",
      aborted,
    };
  }

  async completeJson<T>(request: LlmJsonRequest<T>): Promise<{
    data: T;
    result: LlmCompleteResult;
  }> {
    const withHint: LlmCompleteRequest = {
      ...request,
      messages: [
        ...request.messages,
        {
          role: "user",
          content: `Respond with JSON only (no markdown fences). Schema: ${request.schemaDescription}`,
        },
      ],
    };

    let result = await this.complete(withHint);
    try {
      return { data: request.parse(stripJsonFences(result.text)), result };
    } catch (firstErr) {
      // One retry with validation error (docs/06).
      const retry = await this.complete({
        ...withHint,
        messages: [
          ...withHint.messages,
          { role: "assistant", content: result.text },
          {
            role: "user",
            content: `Your previous reply was invalid JSON: ${(firstErr as Error).message}. Reply with valid JSON only.`,
          },
        ],
      });
      result = retry;
      return { data: request.parse(stripJsonFences(result.text)), result };
    }
  }
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}
