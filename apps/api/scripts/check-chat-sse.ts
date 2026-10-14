/**
 * 3.8 — Create conversation via HTTP, stream with Fake LLM, assert persistence.
 *
 * Usage:
 *   # API on :4000 for register/persona/session
 *   pnpm --filter @memora/api exec tsx scripts/check-chat-sse.ts
 */
import "../src/load-env";
import { randomUUID } from "node:crypto";
import {
  conversationMessages,
  createDb,
  users,
} from "@memora/db";
import { eq } from "drizzle-orm";
import { AuditService } from "../src/auth/audit.service";
import { ChatService } from "../src/chat/chat.service";
import type { SseWriter } from "../src/chat/sse";
import { FakeLlmAdapter } from "../src/llm/fake-llm.adapter";
import { ProviderConsentService } from "../src/llm/provider-consent.service";
import { PersonaAccessService } from "../src/personas/persona-access.service";
import { PromptBuilderService } from "../src/prompt/prompt-builder.service";

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

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const email = `chat-${suffix}@test.local`;
  const password = "TestPass123!";

  const reg = await fetch(`${API}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Chat" }),
  });
  if (!reg.ok) throw new Error(`register ${reg.status}`);
  const { userId } = (await reg.json()) as { userId: string };

  const { db, client } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, userId));

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

    const create = await fetch(`${API}/api/v1/personas`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        scenario: "living",
        displayName: `Chat ${suffix}`,
        languages: ["en"],
        providerKey: "openrouter",
        attestation: { kind: "self", statement: "I am the subject." },
        consents: [
          { purpose: "host_records", statementVersion: "v1" },
          { purpose: "converse", statementVersion: "v1" },
          {
            purpose: "send_to_provider",
            providerKey: "openrouter",
            statementVersion: "v1",
          },
        ],
      }),
    });
    if (!create.ok) {
      throw new Error(`persona ${create.status} ${await create.text()}`);
    }
    const persona = (await create.json()) as { id: string };

    const sessRes = await fetch(
      `${API}/api/v1/personas/${persona.id}/conversations`,
      { method: "POST", headers, body: "{}" },
    );
    if (!sessRes.ok) {
      throw new Error(`session ${sessRes.status} ${await sessRes.text()}`);
    }
    const session = (await sessRes.json()) as { id: string };
    console.log("ok created conversation session", session.id);

    const audit = new AuditService(db);
    const access = new PersonaAccessService(db, audit);
    const consent = new ProviderConsentService(db);
    const fake = new FakeLlmAdapter(consent);
    fake.replyText = "Hello from fake stream.";
    const prompts = new PromptBuilderService();
    const retrieval = {
      retrieve: async () => ({ chunks: [], memories: [] }),
    };
    const chat = new ChatService(
      db,
      access,
      prompts,
      retrieval as never,
      fake,
      audit,
    );

    const events: string[] = [];
    const sse: SseWriter = {
      send: (event) => events.push(event),
      comment: () => undefined,
      end: () => undefined,
    };

    await chat.streamMessage(
      userId,
      persona.id,
      session.id,
      { text: "Hi there" },
      sse,
      new AbortController().signal,
    );

    if (!events.includes("token") || !events.includes("done")) {
      throw new Error(`expected token+done, got ${events.join(",")}`);
    }
    console.log("ok SSE token + done events");

    const msgs = await db.query.conversationMessages.findMany({
      where: eq(conversationMessages.sessionId, session.id),
    });
    const assistant = msgs.find((m) => m.role === "assistant");
    if (!assistant || assistant.status !== "complete") {
      throw new Error(
        `assistant status ${assistant?.status}, content=${assistant?.content}`,
      );
    }
    if (!assistant.content.includes("fake stream")) {
      throw new Error(`unexpected content: ${assistant.content}`);
    }
    console.log("ok assistant message persisted complete");

    // Abort path: second message, abort mid-stream
    const fake2 = new FakeLlmAdapter(consent);
    fake2.replyText = "ABCDEFGHIJKLMNOP";
    fake2.streamDelayMs = 40;
    const chat2 = new ChatService(
      db,
      access,
      prompts,
      retrieval as never,
      fake2,
      audit,
    );
    const ac = new AbortController();
    const run = chat2.streamMessage(
      userId,
      persona.id,
      session.id,
      { text: "abort me" },
      {
        send: () => undefined,
        comment: () => undefined,
        end: () => undefined,
      },
      ac.signal,
    );
    await new Promise((r) => setTimeout(r, 100));
    ac.abort();
    await run;

    const after = await db.query.conversationMessages.findMany({
      where: eq(conversationMessages.sessionId, session.id),
    });
    const aborted = after
      .filter((m) => m.role === "assistant")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (!aborted || aborted.status === "streaming") {
      throw new Error(
        `expected terminal status after abort, got ${aborted?.status}`,
      );
    }
    if (aborted.status !== "aborted" && aborted.status !== "complete") {
      throw new Error(`unexpected status ${aborted.status}`);
    }
    console.log(
      "ok disconnect/abort left terminal row status=",
      aborted.status,
      "len=",
      aborted.content.length,
    );
    console.log("ok chat SSE persistence check passed");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
