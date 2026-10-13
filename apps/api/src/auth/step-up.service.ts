import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS } from "../redis/redis.tokens";

/** How long a successful MFA step-up remains valid for sensitive actions. */
const STEP_UP_TTL_SEC = 60 * 10;

@Injectable()
export class StepUpService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async markVerified(sessionId: string): Promise<void> {
    await this.redis.set(
      this.key(sessionId),
      "1",
      "EX",
      STEP_UP_TTL_SEC,
    );
  }

  async isVerified(sessionId: string): Promise<boolean> {
    return Boolean(await this.redis.get(this.key(sessionId)));
  }

  async clear(sessionId: string): Promise<void> {
    await this.redis.del(this.key(sessionId));
  }

  private key(sessionId: string): string {
    return `auth:stepup:${sessionId}`;
  }
}
