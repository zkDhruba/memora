import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthTokensService } from "./auth-tokens.service";
import { AuditService } from "./audit.service";
import { PasswordService } from "./password.service";
import { SessionGuard } from "./session.guard";
import { SessionService } from "./session.service";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";

@Module({
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    AuthTokensService,
    AuditService,
    PasswordService,
    SessionService,
    SessionGuard,
    MeService,
  ],
  exports: [SessionService, SessionGuard, AuditService],
})
export class AuthModule {}
