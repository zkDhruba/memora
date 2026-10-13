import { Inject, Injectable } from "@nestjs/common";
import { processingJobs, type MemoraDb } from "@memora/db";
import { and, eq } from "drizzle-orm";
import { newId } from "../common/ids";
import { DB } from "../db/db.tokens";
import type { IngestionJobName } from "./jobs.constants";

@Injectable()
export class ProcessingJobsRepository {
  constructor(@Inject(DB) private readonly db: MemoraDb) {}

  async findByUnique(input: {
    fileVersionId: string;
    stage: IngestionJobName;
    generation: number;
  }) {
    return this.db.query.processingJobs.findFirst({
      where: and(
        eq(processingJobs.fileVersionId, input.fileVersionId),
        eq(processingJobs.stage, input.stage),
        eq(processingJobs.generation, input.generation),
      ),
    });
  }

  async createPending(input: {
    personaId: string;
    fileVersionId: string;
    stage: IngestionJobName;
    generation: number;
  }) {
    const existing = await this.findByUnique(input);
    if (existing) {
      return existing;
    }
    const id = newId();
    await this.db.insert(processingJobs).values({
      id,
      personaId: input.personaId,
      fileVersionId: input.fileVersionId,
      stage: input.stage,
      generation: input.generation,
      status: "pending",
      attempts: 0,
    });
    const row = await this.db.query.processingJobs.findFirst({
      where: eq(processingJobs.id, id),
    });
    if (!row) {
      throw new Error("Failed to create processing job");
    }
    return row;
  }

  async markActive(id: string, bullmqJobId: string, attempts: number) {
    await this.db
      .update(processingJobs)
      .set({
        status: "active",
        bullmqJobId,
        attempts,
        errorCode: null,
      })
      .where(eq(processingJobs.id, id));
  }

  async markCompleted(id: string, attempts: number) {
    await this.db
      .update(processingJobs)
      .set({
        status: "completed",
        attempts,
        errorCode: null,
      })
      .where(eq(processingJobs.id, id));
  }

  async markFailed(id: string, attempts: number, errorCode: string) {
    await this.db
      .update(processingJobs)
      .set({
        status: "failed",
        attempts,
        errorCode,
      })
      .where(eq(processingJobs.id, id));
  }

  async markDead(id: string, attempts: number, errorCode: string) {
    await this.db
      .update(processingJobs)
      .set({
        status: "dead",
        attempts,
        errorCode,
      })
      .where(eq(processingJobs.id, id));
  }

  async getById(id: string) {
    return this.db.query.processingJobs.findFirst({
      where: eq(processingJobs.id, id),
    });
  }
}
