import { Module } from "@nestjs/common";
import { DbModule } from "./db/db.module";
import { JobsModule } from "./jobs/jobs.module";
import { StorageModule } from "./storage/storage.module";

/** Lean Nest context for background workers (no HTTP). */
@Module({
  imports: [DbModule, StorageModule, JobsModule],
})
export class WorkerModule {}
