import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  processingJobStageEnum,
  processingJobStatusEnum,
} from "./enums";
import { personas } from "./personas";
import { sourceFileVersions } from "./sources";

export const processingJobs = pgTable(
  "processing_jobs",
  {
    id: uuid("id").primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    fileVersionId: uuid("file_version_id")
      .notNull()
      .references(() => sourceFileVersions.id, { onDelete: "cascade" }),
    stage: processingJobStageEnum("stage").notNull(),
    generation: integer("generation").notNull(),
    status: processingJobStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    errorCode: text("error_code"),
    bullmqJobId: text("bullmq_job_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("processing_jobs_version_stage_generation_uq").on(
      t.fileVersionId,
      t.stage,
      t.generation,
    ),
    index("processing_jobs_persona_status_idx").on(t.personaId, t.status),
  ],
);
