import { Global, Inject, Module, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { env } from "../config/env";
import { REDIS } from "./redis.tokens";

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () => new Redis(env.redisUrl(), { maxRetriesPerRequest: 3 }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
