/**
 * BullMQ retry + dead-letter check.
 *
 * 1) Job forced to fail until attempt 3 → completes (retries work).
 * 2) test_fail stage → dead after 5 attempts + DLQ entry.
 *
 * Usage (Redis + Postgres up; no separate worker needed — script runs one):
 *   pnpm --filter @memora/api exec tsx scripts/check-job-retry.ts
 */
import "../src/load-env";
import { NestFactory } from "@nestjs/core";
import {
  createDb,
  personaMemberships,
  personas,
  sourceFiles,
  sourceFileVersions,
  sourceImports,
  subscriptions,
  users,
} from "@memora/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { AppModule } from "../src/app.module";
import { newId } from "../src/common/ids";
import { IngestionQueueService } from "../src/jobs/ingestion-queue.service";
import { IngestionProcessor } from "../src/jobs/ingestion.processor";
import { startIngestionWorker } from "../src/jobs/ingestion.worker";
import { ProcessingJobsRepository } from "../src/jobs/processing-jobs.repository";
import { INGESTION_MAX_ATTEMPTS } from "../src/jobs/jobs.constants";

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function seedFileVersion() {
  const { db, client } = createDb(process.env.DATABASE_URL!, { max: 2 });
  const userId = newId();
  const personaId = newId();
  const importId = newId();
  const fileId = newId();
  const versionId = newId();
  const suffix = randomUUID().slice(0, 8);

  try {
    await db.insert(users).values({
      id: userId,
      email: `jobs-${suffix}@test.local`,
      passwordHash: "x",
      displayName: "Jobs",
      emailVerifiedAt: new Date(),
    });
    await db.insert(subscriptions).values({
      userId,
      planId: "free",
      status: "active",
    });
    await db.insert(personas).values({
      id: personaId,
      scenario: "living",
      status: "collecting",
      displayName: "Jobs Persona",
      languages: ["en"],
      createdByUserId: userId,
    });
    await db.insert(personaMemberships).values({
      id: newId(),
      personaId,
      userId,
      role: "owner",
      audience: "private",
    });
    await db.insert(sourceImports).values({
      id: importId,
      personaId,
      createdByUserId: userId,
      status: "open",
      fileCount: 1,
    });
    await db.insert(sourceFiles).values({
      id: fileId,
      personaId,
      importId,
      uploadedByUserId: userId,
      originalFilename: "jobs.txt",
      mediaType: "text/plain",
      byteSize: 1,
      objectKey: `test/${fileId}`,
      bucket: "memora-clean",
      status: "clean",
    });
    await db.insert(sourceFileVersions).values({
      id: versionId,
      fileId,
      generation: 1,
      objectKey: `test/${fileId}`,
      bucket: "memora-clean",
      parseReport: {},
    });
  } finally {
    await client.end({ timeout: 5 });
  }

  return { personaId, versionId, userId, fileId };
}

async function waitForJob(
  repo: ProcessingJobsRepository,
  id: string,
  status: string,
  timeoutMs = 30_000,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = await repo.getById(id);
    if (row?.status === status) return row;
    await sleep(200);
  }
  const row = await repo.getById(id);
  throw new Error(
    `Timeout waiting for job ${id} status=${status}, last=${row?.status} attempts=${row?.attempts}`,
  );
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const queue = app.get(IngestionQueueService);
  const repo = app.get(ProcessingJobsRepository);
  const processor = app.get(IngestionProcessor);
  const worker = startIngestionWorker(processor);

  try {
    // --- A: retries then success ---
    const a = await seedFileVersion();
    const enqA = await queue.enqueue({
      personaId: a.personaId,
      fileVersionId: a.versionId,
      stage: "parse",
      generation: 1,
      forceFailUntilAttempt: 3,
    });
    if (enqA.skipped) throw new Error("unexpected skip A");
    const doneA = await waitForJob(repo, enqA.processingJobId, "completed");
    if (doneA.attempts !== 3) {
      throw new Error(`expected 3 attempts, got ${doneA.attempts}`);
    }
    console.log("ok retry-then-success attempts=3");

    // --- B: always fail → DLQ ---
    const dlqBefore = await queue.deadLetterCount();
    const b = await seedFileVersion();
    // Use a second version generation on a new file for test_fail stage
    const enqB = await queue.enqueue({
      personaId: b.personaId,
      fileVersionId: b.versionId,
      stage: "test_fail",
      generation: 1,
    });
    if (enqB.skipped) throw new Error("unexpected skip B");
    const dead = await waitForJob(repo, enqB.processingJobId, "dead", 45_000);
    if (dead.attempts !== INGESTION_MAX_ATTEMPTS) {
      throw new Error(
        `expected ${INGESTION_MAX_ATTEMPTS} attempts on dead job, got ${dead.attempts}`,
      );
    }
    // DLQ may briefly lag
    let dlqAfter = await queue.deadLetterCount();
    for (let i = 0; i < 20 && dlqAfter <= dlqBefore; i++) {
      await sleep(150);
      dlqAfter = await queue.deadLetterCount();
    }
    if (dlqAfter <= dlqBefore) {
      throw new Error(
        `expected DLQ depth to increase (before=${dlqBefore} after=${dlqAfter})`,
      );
    }
    console.log(
      `ok dead-letter after ${INGESTION_MAX_ATTEMPTS} attempts; dlq ${dlqBefore}→${dlqAfter}`,
    );
    console.log("job-retry check passed");
  } finally {
    await worker.close().catch(() => undefined);
    await app.close().catch(() => undefined);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
