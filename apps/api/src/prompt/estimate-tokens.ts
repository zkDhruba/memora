import { estimateTokens as chunkEstimateTokens } from "../chunking/chunk-types";

/** Re-export the shared char/4 estimator used by chunking. */
export function estimateTokens(text: string): number {
  return chunkEstimateTokens(text);
}
