import "./load-env";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module";
import { IngestionProcessor } from "./jobs/ingestion.processor";
import { startIngestionWorker } from "./jobs/ingestion.worker";

async function bootstrap() {
  const log = new Logger("Worker");
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["error", "warn", "log"],
  });

  const processor = app.get(IngestionProcessor);
  const worker = startIngestionWorker(processor);

  const shutdown = async (signal: string) => {
    log.log(`Shutting down (${signal})…`);
    await worker.close();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  log.log("Memora worker ready");
}

void bootstrap();
