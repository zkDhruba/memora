import "./load-env";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { env } from "./config/env";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());
  app.enableCors({
    origin: env.webOrigin,
    credentials: true,
  });
  app.getHttpAdapter().getInstance().set("trust proxy", 1);

  await app.listen(env.apiPort);
  // eslint-disable-next-line no-console
  console.log(
    `Memora API listening on http://localhost:${env.apiPort}/api/v1`,
  );
}

void bootstrap();
