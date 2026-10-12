import { Controller, Get } from "@nestjs/common";
import { PLAN_IDS } from "@memora/shared";
import { DB_PACKAGE } from "@memora/db";

@Controller("health")
export class HealthController {
  @Get("live")
  live() {
    return {
      status: "ok",
      service: "memora-api",
      sharedPlans: PLAN_IDS,
      dbPackage: DB_PACKAGE,
    };
  }
}
