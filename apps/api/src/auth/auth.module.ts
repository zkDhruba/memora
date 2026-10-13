import { Module } from "@nestjs/common";
import { CryptoService } from "../common/crypto.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthTokensService } from "./auth-tokens.service";
import { AuditService } from "./audit.service";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";
import { MfaService } from "./mfa.service";
import { PasswordService } from "./password.service";
import { RecentMfaGuard } from "./recent-mfa.guard";
import { SessionGuard } from "./session.guard";
import { SessionService } from "./session.service";
import { StepUpService } from "./step-up.service";

@Module({
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    AuthTokensService,
    AuditService,
    CryptoService,
    PasswordService,
    SessionService,
    SessionGuard,
    MeService,
    MfaService,
    StepUpService,
    RecentMfaGuard,
  ],
  exports: [
    SessionService,
    SessionGuard,
    AuditService,
    MfaService,
    StepUpService,
    RecentMfaGuard,
  ],
})
export class AuthModule {}
