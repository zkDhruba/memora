import { Inject, Injectable } from "@nestjs/common";
import { auditLogs, type MemoraDb } from "@memora/db";
import { desc, eq } from "drizzle-orm";
import { newId } from "../common/ids";
import { DB } from "../db/db.tokens";

export type AuditRecordInput = {
  actorUserId?: string | null;
  personaId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
};

export type AuditLogItem = {
  id: string;
  action: string;
  personaId: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: MemoraDb) {}

  async record(input: AuditRecordInput): Promise<void> {
    await this.db.insert(auditLogs).values({
      id: newId(),
      actorUserId: input.actorUserId ?? null,
      personaId: input.personaId ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? {},
    });
  }

  /** Recent rows written by this user (actor). Newest first. */
  async listForActor(
    actorUserId: string,
    opts: { limit?: number } = {},
  ): Promise<AuditLogItem[]> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const rows = await this.db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        personaId: auditLogs.personaId,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(eq(auditLogs.actorUserId, actorUserId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    return rows;
  }
}
