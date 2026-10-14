/**
 * 3.1 — LlmPort + OpenRouter: refuse without consent; succeed with send_to_provider.
 *
 * Usage (API deps up, OPENROUTER_API_KEY in .env):
 *   pnpm --filter @memora/api exec tsx scripts/check-llm.ts
 */
import "../src/load-env";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { HttpException } from "@nestjs/common";
import { createDb, users } from "@memora/db";
import { eq } from "drizzle-orm";
import { AppModule } from "../src/app.module";
import { env } from "../src/config/env";
import { LLM_PORT, type LlmPort } from "../src/llm/llm.port";

const API = process.env.API_URL ?? "http://localhost:4000";

type Jar = { cookie: string };

function captureCookies(res: Response, jar: Jar) {
  const set = res.headers.getSetCookie?.() ?? [];
  const parts = set.map((c) => c.split(";")[0]!).filter(Boolean);
  if (parts.length) {
    jar.cookie = [...(jar.cookie ? jar.cookie.split("; ") : []), ...parts].join(
      "; ",
    );
  }
}

function errCode(err: unknown): string | undefined {
  if (err instanceof HttpException) {
    const body = err.getResponse() as { error?: { code?: string } };
    return body.error?.code;
  }
  return undefined;
}

async function main() {
  if (!env.openrouter.apiKey()) {
    console.error("FAIL: set OPENROUTER_API_KEY in .env (never commit the key)");
    process.exit(2);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const llm = app.get<LlmPort>(LLM_PORT);

  try {
    const suffix = randomUUID().slice(0, 8);
    const email = `llm-${suffix}@test.local`;
    const password = "TestPass123!";

    const reg = await fetch(`${API}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "LLM" }),
    });
    if (!reg.ok) throw new Error(`register ${reg.status}`);
    const { userId } = (await reg.json()) as { userId: string };

    {
      const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
      try {
        await db
          .update(users)
          .set({ emailVerifiedAt: new Date() })
          .where(eq(users.id, userId));
      } finally {
        await client.end({ timeout: 5 });
      }
    }

    const jar: Jar = { cookie: "" };
    const login = await fetch(`${API}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    captureCookies(login, jar);
    const headers = {
      "Content-Type": "application/json",
      Cookie: jar.cookie,
    };

    // Create without send_to_provider
    const create = await fetch(`${API}/api/v1/personas`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        scenario: "living",
        displayName: `LLM ${suffix}`,
        languages: ["en"],
        providerKey: "openrouter",
        attestation: { kind: "self", statement: "I am the subject." },
        consents: [
          { purpose: "host_records", statementVersion: "v1" },
          { purpose: "converse", statementVersion: "v1" },
        ],
      }),
    });
    if (!create.ok) throw new Error(`persona ${create.status} ${await create.text()}`);
    const persona = (await create.json()) as { id: string };

    try {
      await llm.complete({
        personaId: persona.id,
        purpose: "test",
        provider: "openrouter",
        model: env.openrouter.defaultModel(),
        messages: [{ role: "user", content: "Reply with the single word: pong" }],
        maxOutputTokens: 32,
      });
      console.error("FAIL: expected CONSENT_REQUIRED without send_to_provider");
      process.exit(1);
    } catch (err) {
      if (errCode(err) !== "CONSENT_REQUIRED") {
        console.error("FAIL: wrong error", err);
        process.exit(1);
      }
      console.log("ok refuse without send_to_provider → CONSENT_REQUIRED");
    }

    const consentRes = await fetch(
      `${API}/api/v1/personas/${persona.id}/consents`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          purpose: "send_to_provider",
          providerKey: "openrouter",
          statementVersion: "v1",
        }),
      },
    );
    if (!consentRes.ok) {
      throw new Error(
        `grant consent ${consentRes.status} ${await consentRes.text()}`,
      );
    }
    console.log("ok granted send_to_provider for openrouter");

    const result = await llm.complete({
      personaId: persona.id,
      purpose: "test",
      provider: "openrouter",
      model: env.openrouter.defaultModel(),
      messages: [
        {
          role: "user",
          content: "Reply with exactly one word: pong",
        },
      ],
      maxOutputTokens: 32,
      temperature: 0,
    });

    if (!result.text || result.provider !== "openrouter") {
      throw new Error(`unexpected result ${JSON.stringify(result)}`);
    }
    console.log(
      JSON.stringify({
        ok: true,
        model: result.model,
        preview: result.text.slice(0, 80),
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      }),
    );
    console.log("ok llm complete with consent — check-llm passed");
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
