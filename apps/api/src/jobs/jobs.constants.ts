export const INGESTION_QUEUE = "ingestion";
export const INGESTION_DLQ = "ingestion-dlq";

/** Default attempts before dead-letter (docs/05). */
export const INGESTION_MAX_ATTEMPTS = 5;

export type IngestionJobName = "parse" | "test_fail";

export type IngestionJobPayload = {
  processingJobId: string;
  personaId: string;
  fileVersionId: string;
  stage: IngestionJobName;
  generation: number;
  /** For retry tests: throw until attemptsMade reaches this (1-based). */
  forceFailUntilAttempt?: number;
};
