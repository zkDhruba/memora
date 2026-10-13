import "../src/load-env";
import { NestFactory } from "@nestjs/core";
import { HttpException } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PlanGuardService } from "../src/plans/plan-guard.service";

async function main() {
  const userId = process.argv[2];
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const g = app.get(PlanGuardService);
  try {
    await g.assertCanSendChatMessage(userId);
    console.error("FAIL expected PLAN_LIMIT_CHAT_DAY");
    process.exit(1);
  } catch (err) {
    if (err instanceof HttpException) {
      const body = err.getResponse() as any;
      if (body.error?.code === "PLAN_LIMIT_CHAT_DAY") {
        console.log(JSON.stringify({ ok: true, error: body.error }));
        await app.close();
        process.exit(0);
      }
    }
    throw err;
  }
}
void main();
