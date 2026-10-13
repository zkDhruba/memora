import { Inject, Injectable, Logger } from "@nestjs/common";
import { sourceFileVersions, type MemoraDb } from "@memora/db";
import { eq } from "drizzle-orm";
import type { Job } from "bullmq";
import { DB } from "../db/db.tokens";
import type { IngestionJobPayload } from "./jobs.constants";
import { INGESTION_MAX_ATTEMPTS } from "./jobs.constants";
import { IngestionQueueService } from "./ingestion-queue.service";
import { ProcessingJobsRepository } from "./processing-jobs.repository";

@Injectable()
export class IngestionProcessor {
  private readonly log = new Logger(IngestionProcessor.name);

  constructor(
    @Inject(DB) private readonly db: MemoraDb,
    @Inject(ProcessingJobsRepository)
    private readonly jobs: ProcessingJobsRepository,
    @Inject(IngestionQueueService)
    private readonly queue: IngestionQueueService,
  ) {}

  async process(job: Job<IngestionJobPayload>): Promise<void> {
    const data = job.data;
    const attempts = job.attemptsMade + 1;

    await this.jobs.markActive(data.processingJobId, String(job.id), attempts);

    this.log.log(
      `Process ${data.stage} attempt ${attempts}/${INGESTION_MAX_ATTEMPTS} job=${job.id}`,
    );

    if (
      data.forceFailUntilAttempt &&
      attempts < data.forceFailUntilAttempt
    ) {
      throw new Error(
        `Forced failure for retry test (attempt ${attempts}/${data.forceFailUntilAttempt})`,
      );
    }

    if (data.stage === "test_fail") {
      // Always fail — used to exercise DLQ after max attempts.
      throw new Error("test_fail stage always fails");
    }

    if (data.stage === "parse") {
      // Stub until 2.4 parsers: record that the queue ran.
      const version = await this.db.query.sourceFileVersions.findFirst({
        where: eq(sourceFileVersions.id, data.fileVersionId),
      });
      if (version) {
        await this.db
          .update(sourceFileVersions)
          .set({
            parseReport: {
              ...(version.parseReport ?? {}),
              parse: "queued_stub",
              processedAt: new Date().toISOString(),
              generation: data.generation,
            },
          })
          .where(eq(sourceFileVersions.id, data.fileVersionId));
      }
    }

    await this.jobs.markCompleted(data.processingJobId, attempts);
  }

  async onFailed(job: Job<IngestionJobPayload> | undefined, err: Error) {
    if (!job) return;
    const attempts = job.attemptsMade;
    const max = job.opts.attempts ?? INGESTION_MAX_ATTEMPTS;
    const code = err.message.slice(0, 120);

    if (attempts >= max) {
      this.log.warn(
        `Dead-letter ${job.data.stage} after ${attempts} attempts: ${code}`,
      );
      await this.queue.moveToDeadLetter(job.data, code);
      return;
    }

    await this.jobs.markFailed(job.data.processingJobId, attempts, code);
  }
}
