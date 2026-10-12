import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  });
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Memora API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
