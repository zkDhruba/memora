import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { newOpaqueToken } from "../common/ids";
import { REDIS } from "../redis/redis.tokens";

const VERIFY_TTL_SEC = 60 * 60 * 24;
const RESET_TTL_SEC = 60 * 60;
const LOCKOUT_TTL_SEC = 60 * 60;
const LOCKOUT_MAX = 10;

@Injectable()
export class AuthTokensService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async issueVerifyToken(userId: string): Promise<string> {
    const token = newOpaqueToken();
    await this.redis.set(`auth:verify:${token}`, userId, "EX", VERIFY_TTL_SEC);
    return token;
  }

  async consumeVerifyToken(token: string): Promise<string | null> {
    const key = `auth:verify:${token}`;
    const userId = await this.redis.get(key);
    if (!userId) return null;
    await this.redis.del(key);
    return userId;
  }

  async issueResetToken(userId: string): Promise<string> {
    const token = newOpaqueToken();
    await this.redis.set(`auth:reset:${token}`, userId, "EX", RESET_TTL_SEC);
    return token;
  }

  async consumeResetToken(token: string): Promise<string | null> {
    const key = `auth:reset:${token}`;
    const userId = await this.redis.get(key);
    if (!userId) return null;
    await this.redis.del(key);
    return userId;
  }

  async isLoginLocked(email: string): Promise<boolean> {
    const count = Number(await this.redis.get(this.lockKey(email)) ?? 0);
    return count >= LOCKOUT_MAX;
  }

  async recordLoginFailure(email: string): Promise<void> {
    const key = this.lockKey(email);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, LOCKOUT_TTL_SEC);
    }
  }

  async clearLoginFailures(email: string): Promise<void> {
    await this.redis.del(this.lockKey(email));
  }

  private lockKey(email: string): string {
    return `auth:login_fail:${email.toLowerCase()}`;
  }
}
