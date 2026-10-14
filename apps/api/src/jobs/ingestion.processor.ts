import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { ChunkEmbeddingService } from "../embeddings/chunk-embedding.service";
import { MemoryExtractService } from "../memory/memory-extract.service";
import { DocumentParseService } from "../parsing/document-parse.service";
import { TraitExtractService } from "../personality/trait-extract.service";
import type { IngestionJobPayload } from "./jobs.constants";
import { INGESTION_MAX_ATTEMPTS } from "./jobs.constants";
import { IngestionQueueService } from "./ingestion-queue.service";
import { ProcessingJobsRepository } from "./processing-jobs.repository";

@Injectable()
export class IngestionProcessor {
  private readonly log = new Logger(IngestionProcessor.name);

  constructor(
    @Inject(ProcessingJobsRepository)
    private readonly jobs: ProcessingJobsRepository,
    @Inject(IngestionQueueService)
    private readonly queue: IngestionQueueService,
    @Inject(DocumentParseService)
    private readonly documentParse: DocumentParseService,
    @Inject(ChunkEmbeddingService)
    private readonly embeddings: ChunkEmbeddingService,
    @Inject(TraitExtractService)
    private readonly traits: TraitExtractService,
    @Inject(MemoryExtractService)
    private readonly memoryExtract: MemoryExtractService,
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
      throw new Error("test_fail stage always fails");
    }

    if (data.stage === "parse") {
      await this.documentParse.parseFileVersion({
        personaId: data.personaId,
        fileVersionId: data.fileVersionId,
        generation: data.generation,
      });
      // Prose/docs are chunked in parse. WhatsApp waits for subject mapping
      // (API enqueues embed after mapping). Still enqueue embed for docs.
      await this.queue.enqueue({
        personaId: data.personaId,
        fileVersionId: data.fileVersionId,
        stage: "embed",
        generation: data.generation,
      });
    } else if (data.stage === "embed") {
      // Loop many batches in one job. Unique (version, stage, generation)
      // prevents a second embed pass after markCompleted.
      const { embedded, remaining } = await this.embeddings.embedPersonaChunks(
        data.personaId,
        { limit: 64, maxBatches: 120 },
      );
      this.log.log(
        `embed persona=${data.personaId} embedded=${embedded} remaining=${remaining}`,
      );
      if (remaining > 0) {
        this.log.warn(
          `embed incomplete persona=${data.personaId} remaining=${remaining} — run Build knowledge again`,
        );
      }
      await this.queue.enqueue({
        personaId: data.personaId,
        fileVersionId: data.fileVersionId,
        stage: "extract",
        generation: data.generation,
      });
    } else if (data.stage === "extract") {
      const traits = await this.traits.extractForPersona(data.personaId);
      const memories = await this.memoryExtract.extractBiographical(
        data.personaId,
      );
      this.log.log(
        `extract persona=${data.personaId} traitsB=${traits.classBInserted} traitsC=${traits.classCInserted} memories=${memories.inserted}`,
      );
    } else if (data.stage === "purge") {
      // Handled by file purge path / dedicated jobs — no-op here if reached.
      this.log.warn(`purge stage via ingestion worker is a no-op for ${job.id}`);
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
