import { Logger } from "@nestjs/common";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env";
import {
  INGESTION_MAX_ATTEMPTS,
  INGESTION_QUEUE,
  type IngestionJobPayload,
} from "./jobs.constants";
import { IngestionProcessor } from "./ingestion.processor";

export function startIngestionWorker(processor: IngestionProcessor): Worker {
  const log = new Logger("IngestionWorker");
  const connection = new IORedis(env.redisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const worker = new Worker<IngestionJobPayload>(
    INGESTION_QUEUE,
    async (job) => processor.process(job),
    {
      connection,
      concurrency: 2,
    },
  );

  worker.on("completed", (job) => {
    log.log(`Completed ${job.name} id=${job.id}`);
  });

  worker.on("failed", (job, err) => {
    log.warn(
      `Failed ${job?.name} id=${job?.id} attempt=${job?.attemptsMade}/${job?.opts.attempts ?? INGESTION_MAX_ATTEMPTS}: ${err.message}`,
    );
    void processor.onFailed(job, err);
  });

  worker.on("error", (err) => {
    log.error(`Worker error: ${err.message}`);
  });

  log.log(`Listening on queue ${INGESTION_QUEUE}`);
  return worker;
}
