import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { ApiException } from "../common/api-exception";
import { env } from "../config/env";
import { ProviderConsentService } from "../llm/provider-consent.service";
import type { EmbeddingPort, EmbeddingRequest, EmbeddingResult } from "./embedding.port";

type OpenRouterEmbeddingResponse = {
  data?: Array<{ embedding?: number[]; index?: number }>;
  model?: string;
  error?: { message?: string };
};

/**
 * OpenAI-compatible embeddings via OpenRouter (testing).
 * Model: openai/text-embedding-3-small → 1536 dims.
 */
@Injectable()
export class OpenRouterEmbeddingAdapter implements EmbeddingPort {
  private readonly log = new Logger(OpenRouterEmbeddingAdapter.name);

  constructor(
    @Inject(ProviderConsentService)
    private readonly consent: ProviderConsentService,
  ) {}

  async embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
    if (request.texts.length === 0) {
      return {
        model: request.model ?? env.embeddings.model(),
        dims: env.embeddings.dims(),
        vectors: [],
      };
    }

    await this.consent.assertCanCallProvider(
      request.personaId,
      env.embeddings.provider(),
    );

    const apiKey = env.openrouter.apiKey();
    if (!apiKey) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "LLM_NOT_CONFIGURED",
        "OPENROUTER_API_KEY is not set (required for embeddings in MVP testing).",
      );
    }

    const model = request.model ?? env.embeddings.model();
    const url = env.embeddings.baseUrl();

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": env.openrouter.httpReferer(),
          "X-Title": env.openrouter.appTitle(),
        },
        body: JSON.stringify({
          model,
          input: request.texts,
        }),
      });
    } catch (err) {
      this.log.error(`embeddings network: ${(err as Error).message}`);
      throw new ApiException(
        HttpStatus.BAD_GATEWAY,
        "EMBEDDING_UPSTREAM_ERROR",
        "Failed to reach embedding provider.",
        { cause: (err as Error).message },
      );
    }

    const raw = await res.text();
    let parsed: OpenRouterEmbeddingResponse;
    try {
      parsed = JSON.parse(raw) as OpenRouterEmbeddingResponse;
    } catch {
      throw new ApiException(
        HttpStatus.BAD_GATEWAY,
        "EMBEDDING_UPSTREAM_ERROR",
        "Embedding provider returned non-JSON.",
        { status: res.status },
      );
    }

    if (!res.ok) {
      throw new ApiException(
        HttpStatus.BAD_GATEWAY,
        "EMBEDDING_UPSTREAM_ERROR",
        parsed.error?.message ?? `Embedding HTTP ${res.status}`,
        { status: res.status },
      );
    }

    const rows = [...(parsed.data ?? [])].sort(
      (a, b) => (a.index ?? 0) - (b.index ?? 0),
    );
    const vectors = rows.map((r) => r.embedding ?? []);
    if (vectors.length !== request.texts.length) {
      throw new ApiException(
        HttpStatus.BAD_GATEWAY,
        "EMBEDDING_UPSTREAM_ERROR",
        `Expected ${request.texts.length} vectors, got ${vectors.length}.`,
      );
    }
    const dims = vectors[0]?.length ?? env.embeddings.dims();
    if (dims !== env.embeddings.dims()) {
      this.log.warn(
        `embedding dims ${dims} != configured ${env.embeddings.dims()}`,
      );
    }

    return {
      model: parsed.model ?? model,
      dims,
      vectors,
    };
  }
}
