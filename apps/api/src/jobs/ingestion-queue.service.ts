import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import type { IngestionJobPayload } from "./jobs.constants";
import {
  INGESTION_DLQ,
  INGESTION_MAX_ATTEMPTS,
  INGESTION_QUEUE,
} from "./jobs.constants";
import { INGESTION_DLQ_TOKEN, INGESTION_QUEUE_TOKEN } from "./jobs.tokens";
import { ProcessingJobsRepository } from "./processing-jobs.repository";

@Injectable()
export class IngestionQueueService implements OnModuleDestroy {
  private readonly log = new Logger(IngestionQueueService.name);

  constructor(
    @Inject(INGESTION_QUEUE_TOKEN) private readonly queue: Queue,
    @Inject(INGESTION_DLQ_TOKEN) private readonly dlq: Queue,
    @Inject(ProcessingJobsRepository)
    private readonly jobs: ProcessingJobsRepository,
  ) {}

  async onModuleDestroy() {
    await Promise.all([this.queue.close(), this.dlq.close()]);
  }

  /**
   * Idempotent enqueue for (fileVersionId, stage, generation).
   * Skips if already completed.
   */
  async enqueue(input: {
    personaId: string;
    fileVersionId: string;
    stage: IngestionJobPayload["stage"];
    generation: number;
    forceFailUntilAttempt?: number;
  }) {
    const row = await this.jobs.createPending({
      personaId: input.personaId,
      fileVersionId: input.fileVersionId,
      stage: input.stage,
      generation: input.generation,
    });

    if (row.status === "completed") {
      return { processingJobId: row.id, skipped: true as const };
    }

    // Reset dead/failed so reprocess can run again at same generation only via new generation.
    if (row.status === "dead" || row.status === "failed") {
      await this.jobs.markFailed(row.id, 0, "requeued");
    }

    const payload: IngestionJobPayload = {
      processingJobId: row.id,
      personaId: input.personaId,
      fileVersionId: input.fileVersionId,
      stage: input.stage,
      generation: input.generation,
      forceFailUntilAttempt: input.forceFailUntilAttempt,
    };

    const jobId = `${input.fileVersionId}:${input.stage}:${input.generation}`;
    const existingBull = await this.queue.getJob(jobId);
    if (existingBull) {
      // Allow re-enqueue after failure / stuck / completed Redis job.
      await existingBull.remove().catch(() => undefined);
    }

    const bullJob = await this.queue.add(input.stage, payload, {
      jobId,
      attempts: INGESTION_MAX_ATTEMPTS,
      backoff: { type: "exponential", delay: 250 },
      removeOnComplete: 100,
      removeOnFail: false,
    });

    await this.jobs.markActive(row.id, String(bullJob.id), 0);

    this.log.log(
      `Enqueued ${input.stage} gen=${input.generation} job=${bullJob.id}`,
    );

    return {
      processingJobId: row.id,
      bullmqJobId: String(bullJob.id),
      skipped: false as const,
    };
  }

  async moveToDeadLetter(
    payload: IngestionJobPayload,
    reason: string,
  ): Promise<void> {
    await this.dlq.add(
      "dead",
      { ...payload, deadReason: reason, deadAt: new Date().toISOString() },
      {
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
    await this.jobs.markDead(
      payload.processingJobId,
      INGESTION_MAX_ATTEMPTS,
      reason.slice(0, 120),
    );
  }

  async deadLetterCount(): Promise<number> {
    return this.dlq.getWaitingCount();
  }

  /** Test helper: waiting + delayed + active on main queue. */
  async ingestionCounts() {
    const [waiting, active, delayed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getDelayedCount(),
      this.queue.getFailedCount(),
    ]);
    return { waiting, active, delayed, failed };
  }
}

// Re-export names for clarity in DI wiring
export { INGESTION_QUEUE, INGESTION_DLQ };
