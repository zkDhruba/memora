import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentAuth } from "../auth/current-auth.decorator";
import type { AuthContext } from "../auth/auth.types";
import { SessionGuard } from "../auth/session.guard";
import { PlanGuardService } from "./plan-guard.service";

@Controller("me")
export class MePlanController {
  constructor(private readonly planGuard: PlanGuardService) {}

  @Get("plan")
  @UseGuards(SessionGuard)
  getPlan(@CurrentAuth() auth: AuthContext) {
    return this.planGuard.getSnapshot(auth.user.id);
  }
}
