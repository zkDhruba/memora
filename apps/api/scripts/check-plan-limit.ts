/**
 * One-shot check: PlanGuard.assertCanCreatePersona throws PLAN_LIMIT_PERSONAS
 * when the user already owns max personas.
 *
 * Usage (API deps up, from repo root):
 *   pnpm --filter @memora/api exec tsx scripts/check-plan-limit.ts <userId>
 */
import "../src/load-env";
import { NestFactory } from "@nestjs/core";
import { HttpException } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PlanGuardService } from "../src/plans/plan-guard.service";

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error("Usage: tsx scripts/check-plan-limit.ts <userId>");
    process.exit(2);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const planGuard = app.get(PlanGuardService);

  const before = await planGuard.getSnapshot(userId);
  console.log(
    JSON.stringify({
      planId: before.planId,
      owned: before.ownedPersonaCount,
      max: before.maxOwnedPersonas,
      canCreate: before.canCreatePersona,
    }),
  );

  try {
    await planGuard.assertCanCreatePersona(userId);
    console.error("FAIL: expected PLAN_LIMIT_PERSONAS");
    process.exit(1);
  } catch (err) {
    if (err instanceof HttpException) {
      const body = err.getResponse() as {
        error?: { code?: string; details?: Record<string, unknown> };
      };
      if (body.error?.code === "PLAN_LIMIT_PERSONAS") {
        console.log(
          JSON.stringify({ ok: true, error: body.error, status: err.getStatus() }),
        );
        await app.close();
        process.exit(0);
      }
    }
    console.error(err);
    process.exit(1);
  }
}

void main();
