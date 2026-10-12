import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { DbModule } from "./db/db.module";
import { HealthController } from "./health.controller";
import { MailModule } from "./mail/mail.module";
import { RedisModule } from "./redis/redis.module";

@Module({
  imports: [DbModule, RedisModule, MailModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
