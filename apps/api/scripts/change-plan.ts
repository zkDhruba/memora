/**
 * Assign a plan to a user and write plan.change audit.
 *
 * Usage:
 *   pnpm --filter @memora/api exec tsx scripts/change-plan.ts <userId> <free|pro|pro_plus> [reason]
 */
import "../src/load-env";
import { NestFactory } from "@nestjs/core";
import { PLAN_IDS, type PlanId } from "@memora/shared";
import { AppModule } from "../src/app.module";
import { PlanAssignService } from "../src/plans/plan-assign.service";

async function main() {
  const userId = process.argv[2];
  const planId = process.argv[3] as PlanId | undefined;
  const reason = process.argv[4] ?? "dev-script";

  if (!userId || !planId || !(PLAN_IDS as readonly string[]).includes(planId)) {
    console.error(
      "Usage: tsx scripts/change-plan.ts <userId> <free|pro|pro_plus> [reason]",
    );
    process.exit(2);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const assign = app.get(PlanAssignService);
    const result = await assign.assignPlan({
      userId,
      planId,
      actorUserId: userId,
      reason,
    });
    console.log(JSON.stringify(result));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
