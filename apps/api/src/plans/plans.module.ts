import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlanGuardService } from "./plan-guard.service";
import { MePlanController } from "./me-plan.controller";

@Module({
  imports: [AuthModule],
  controllers: [MePlanController],
  providers: [PlanGuardService],
  exports: [PlanGuardService],
})
export class PlansModule {}
