import { Inject, Injectable } from "@nestjs/common";
import { sessions, users, type MemoraDb } from "@memora/db";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { env } from "../config/env";
import { maskIp, newId, newOpaqueToken, sha256 } from "../common/ids";
import { DB } from "../db/db.tokens";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: Date | null;
  platformRole: "member" | "admin";
  disabledAt: Date | null;
};

export type ActiveSession = {
  sessionId: string;
  user: SessionUser;
};

@Injectable()
export class SessionService {
  constructor(@Inject(DB) private readonly db: MemoraDb) {}

  async createSession(input: {
    userId: string;
    userAgent?: string;
    ip?: string;
  }): Promise<{ sessionId: string; rawToken: string; expiresAt: Date }> {
    const rawToken = newOpaqueToken();
    const sessionId = newId();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + env.sessionTtlDays);

    await this.db.insert(sessions).values({
      id: sessionId,
      userId: input.userId,
      tokenHash: sha256(rawToken),
      userAgent: input.userAgent?.slice(0, 512) ?? null,
      ipPrefix: maskIp(input.ip),
      expiresAt,
      lastSeenAt: new Date(),
    });

    return { sessionId, rawToken, expiresAt };
  }

  async resolveActiveSession(rawToken: string): Promise<ActiveSession | null> {
    const tokenHash = sha256(rawToken);
    const row = await this.db.query.sessions.findFirst({
      where: and(
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
      with: { user: true },
    });

    if (!row?.user) return null;
    if (row.user.disabledAt) return null;

    return {
      sessionId: row.id,
      user: {
        id: row.user.id,
        email: row.user.email,
        displayName: row.user.displayName,
        emailVerifiedAt: row.user.emailVerifiedAt,
        platformRole: row.user.platformRole,
        disabledAt: row.user.disabledAt,
      },
    };
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  async listForUser(userId: string) {
    return this.db
      .select({
        id: sessions.id,
        userAgent: sessions.userAgent,
        ipPrefix: sessions.ipPrefix,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .orderBy(desc(sessions.createdAt));
  }

  async getUserById(userId: string) {
    return this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
  }
}
