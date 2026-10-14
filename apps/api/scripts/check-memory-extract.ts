/**
 * 3.4 — Biographical memory extract + domain separation.
 *
 * Usage:
 *   pnpm db:migrate
 *   pnpm --filter @memora/api exec tsx scripts/check-memory-extract.ts
 */
import "../src/load-env";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import {
  conversationSessions,
  createDb,
  memories,
  sourceMessages,
  sourceParticipants,
  sourceThreads,
  users,
} from "@memora/db";
import { and, count, eq } from "drizzle-orm";
import { AppModule } from "../src/app.module";
import { env } from "../src/config/env";
import { newId } from "../src/common/ids";
import { MemoryDomainError } from "../src/memory/memory.errors";
import { MemoryExtractService } from "../src/memory/memory-extract.service";
import { MemoryRepository } from "../src/memory/memory.repository";

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
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const extract = app.get(MemoryExtractService);
  const repo = app.get(MemoryRepository);

  try {
    const suffix = randomUUID().slice(0, 8);
    const email = `mem-${suffix}@test.local`;
    const password = "TestPass123!";

    const reg = await fetch(`${API}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Mem" }),
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

    const create = await fetch(`${API}/api/v1/personas`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        scenario: "living",
        displayName: `Mem ${suffix}`,
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

    // Domain guard: conversational session must not write biographical
    try {
      await repo.insertBiographical({
        personaId: persona.id,
        memoryType: "semantic",
        text: "Liked cricket",
        knowledgeClass: "C",
        origin: "extracted",
        conversationSessionId: newId(),
        evidence: { quote: "I like cricket" },
      });
      throw new Error("expected MEMORY_DOMAIN_VIOLATION");
    } catch (err) {
      if (!(err instanceof MemoryDomainError) || err.code !== "MEMORY_DOMAIN_VIOLATION") {
        throw err;
      }
      console.log("ok conversational insert into biographical fails");
    }

    const bodies = [
      "I taught at Dhaka University from 1998.",
      "Watched a cricket match with Karim in 2019.",
      "I still like cricket on weekends.",
    ];
    const subjectId = newId();
    const threadId = newId();

    {
      const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
      try {
        const imp = await fetch(
          `${API}/api/v1/personas/${persona.id}/imports`,
          { method: "POST", headers, body: "{}" },
        );
        if (!imp.ok) throw new Error(`import ${imp.status}`);
        const importId = ((await imp.json()) as { id: string }).id;
        const pre = await fetch(
          `${API}/api/v1/personas/${persona.id}/files/presign`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              importId,
              filename: "mem-seed.txt",
              mediaType: "text/plain",
              byteSize: 8,
            }),
          },
        );
        if (!pre.ok) throw new Error(`presign ${pre.status}`);
        const signed = (await pre.json()) as { fileId: string };

        await db.insert(sourceParticipants).values({
          id: subjectId,
          personaId: persona.id,
          fileId: signed.fileId,
          rawLabel: "Me",
          role: "subject",
          retrievalAllowed: true,
        });
        await db.insert(sourceThreads).values({
          id: threadId,
          personaId: persona.id,
          fileId: signed.fileId,
          title: "mem-seed",
        });
        let pos = 0;
        for (const body of bodies) {
          await db.insert(sourceMessages).values({
            id: newId(),
            personaId: persona.id,
            threadId,
            participantId: subjectId,
            kind: "speech",
            sentAt: new Date(),
            body,
            bodyHash: `m${pos}`,
            position: pos++,
          });
        }
      } finally {
        await client.end({ timeout: 5 });
      }
    }

    const filtered = extract.filterCandidates(
      [
        { quote: "Dhaka University", text: "Taught in Dhaka" },
        { quote: "I invented a moon colony", text: "Fake" },
      ],
      bodies.join("\n"),
    );
    if (filtered.kept.length !== 1 || filtered.dropped.length !== 1) {
      throw new Error("quote filter failed");
    }
    console.log("ok fake memory quote dropped");

    // Manual grounded biographical insert
    await repo.insertBiographical({
      personaId: persona.id,
      memoryType: "semantic",
      text: "Liked cricket",
      knowledgeClass: "C",
      origin: "extracted",
      evidence: { quote: "I still like cricket" },
    });

    // Conversational path (separate domain)
    const sessionId = newId();
    {
      const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
      try {
        await db.insert(conversationSessions).values({
          id: sessionId,
          personaId: persona.id,
          userId,
          title: "test chat",
        });
      } finally {
        await client.end({ timeout: 5 });
      }
    }
    await repo.insertConversational({
      personaId: persona.id,
      conversationSessionId: sessionId,
      memoryType: "session_fact",
      text: "On this chat, the user mentioned an exam.",
    });

    // Confirm one bio row so searchBiographical (confirmed-only) can see it.
    {
      const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
      try {
        await db
          .update(memories)
          .set({ status: "confirmed" })
          .where(
            and(
              eq(memories.personaId, persona.id),
              eq(memories.domain, "biographical"),
            ),
          );
      } finally {
        await client.end({ timeout: 5 });
      }
    }

    const bio = await repo.searchBiographical(persona.id);
    const convo = await repo.searchConversational(persona.id, sessionId);
    if (bio.some((m) => m.domain !== "biographical")) {
      throw new Error("searchBiographical leaked non-bio");
    }
    if (convo.some((m) => m.domain !== "conversational")) {
      throw new Error("searchConversational leaked bio");
    }
    if (bio.length < 1 || convo.length < 1) {
      throw new Error(`expected both domains, bio=${bio.length} convo=${convo.length}`);
    }
    // Conversational must never appear in biographical search
    if (bio.some((m) => m.memoryType === "session_fact")) {
      throw new Error("session_fact leaked into biographical search");
    }
    console.log("ok searchBiographical ≠ searchConversational");

    if (env.openrouter.apiKey()) {
      const result = await extract.extractBiographical(persona.id, {
        maxSample: 20,
      });
      console.log(
        JSON.stringify({
          llmExtract: true,
          inserted: result.inserted,
          droppedFakeQuotes: result.droppedFakeQuotes,
          sampleSize: result.sampleSize,
        }),
      );
    } else {
      console.log("warn: skip LLM extract (no OPENROUTER_API_KEY)");
    }

    {
      const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
      try {
        const [bioCount] = await db
          .select({ value: count() })
          .from(memories)
          .where(
            and(
              eq(memories.personaId, persona.id),
              eq(memories.domain, "biographical"),
            ),
          );
        const [convoCount] = await db
          .select({ value: count() })
          .from(memories)
          .where(
            and(
              eq(memories.personaId, persona.id),
              eq(memories.domain, "conversational"),
            ),
          );
        console.log(
          JSON.stringify({
            ok: true,
            biographicalRows: Number(bioCount?.value ?? 0),
            conversationalRows: Number(convoCount?.value ?? 0),
          }),
        );
      } finally {
        await client.end({ timeout: 5 });
      }
    }

    console.log("ok memory extract / domain check — check-memory-extract passed");
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
