import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { env } from "../config/env";
import { ProviderConsentService } from "../llm/provider-consent.service";
import type { EmbeddingPort, EmbeddingRequest, EmbeddingResult } from "./embedding.port";

/** Deterministic fake vectors for unit/CI tests — still enforces consent. */
@Injectable()
export class FakeEmbeddingAdapter implements EmbeddingPort {
  constructor(private readonly consent: ProviderConsentService) {}

  async embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
    await this.consent.assertCanCallProvider(
      request.personaId,
      env.embeddings.provider(),
    );
    const dims = env.embeddings.dims();
    const vectors = request.texts.map((t) => hashToUnitVector(t, dims));
    return {
      model: "fake-embedding",
      dims,
      vectors,
    };
  }
}

function hashToUnitVector(text: string, dims: number): number[] {
  const out = new Array<number>(dims).fill(0);
  const digest = createHash("sha256").update(text).digest();
  for (let i = 0; i < dims; i++) {
    out[i] = (digest[i % digest.length]! / 255) * 2 - 1;
  }
  let norm = Math.sqrt(out.reduce((s, v) => s + v * v, 0));
  if (norm === 0) norm = 1;
  return out.map((v) => v / norm);
}
