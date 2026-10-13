import { Module, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env";
import { INGESTION_DLQ, INGESTION_QUEUE } from "./jobs.constants";
import { IngestionQueueService } from "./ingestion-queue.service";
import { IngestionProcessor } from "./ingestion.processor";
import { INGESTION_DLQ_TOKEN, INGESTION_QUEUE_TOKEN } from "./jobs.tokens";
import { ProcessingJobsRepository } from "./processing-jobs.repository";

function bullConnection() {
  // BullMQ requires maxRetriesPerRequest: null on blocking connections.
  return new IORedis(env.redisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

@Module({
  providers: [
    {
      provide: INGESTION_QUEUE_TOKEN,
      useFactory: () =>
        new Queue(INGESTION_QUEUE, {
          connection: bullConnection(),
        }),
    },
    {
      provide: INGESTION_DLQ_TOKEN,
      useFactory: () =>
        new Queue(INGESTION_DLQ, {
          connection: bullConnection(),
        }),
    },
    ProcessingJobsRepository,
    IngestionQueueService,
    IngestionProcessor,
  ],
  exports: [IngestionQueueService, ProcessingJobsRepository, IngestionProcessor],
})
export class JobsModule implements OnModuleDestroy {
  // Queues closed via IngestionQueueService.onModuleDestroy
  async onModuleDestroy() {}
}
