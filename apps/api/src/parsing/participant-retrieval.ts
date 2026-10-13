/**
 * Default retrieval policy for chat export participants (ING / GOV-2).
 * Chunker (2.8) and embeddings must honor `retrievalAllowed` on the row.
 */
export type ParticipantRole = "subject" | "other" | "unknown";

/** Only the mapped subject may be embedded / answered from by default. */
export function defaultRetrievalAllowed(role: ParticipantRole): boolean {
  return role === "subject";
}
