import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { DbModule } from "./db/db.module";
import { FilesModule } from "./files/files.module";
import { HealthController } from "./health.controller";
import { MailModule } from "./mail/mail.module";
import { PersonasModule } from "./personas/personas.module";
import { PlansModule } from "./plans/plans.module";
import { RedisModule } from "./redis/redis.module";
import { ScanningModule } from "./scanning/scanning.module";
import { StorageModule } from "./storage/storage.module";

@Module({
  imports: [
    DbModule,
    RedisModule,
    MailModule,
    StorageModule,
    ScanningModule,
    AuthModule,
    PlansModule,
    PersonasModule,
    FilesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
