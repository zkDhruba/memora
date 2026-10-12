import { Inject, Injectable } from "@nestjs/common";
import { auditLogs, type MemoraDb } from "@memora/db";
import { newId } from "../common/ids";
import { DB } from "../db/db.tokens";

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: MemoraDb) {}

  async record(input: {
    actorUserId?: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.insert(auditLogs).values({
      id: newId(),
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? {},
    });
  }
}
