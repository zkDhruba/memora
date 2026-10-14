/**
 * 3.3 — Style stats + trait drafts; fake quotes dropped.
 *
 * Usage:
 *   pnpm db:migrate
 *   pnpm --filter @memora/api exec tsx scripts/check-style-extract.ts
 */
import "../src/load-env";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import {
  createDb,
  personalityEvidence,
  personalityTraits,
  sourceMessages,
  sourceParticipants,
  sourceThreads,
  users,
} from "@memora/db";
import { count, eq } from "drizzle-orm";
import { AppModule } from "../src/app.module";
import { env } from "../src/config/env";
import { newId } from "../src/common/ids";
import { TraitExtractService } from "../src/personality/trait-extract.service";

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
  const extract = app.get(TraitExtractService);

  try {
    const suffix = randomUUID().slice(0, 8);
    const email = `style-${suffix}@test.local`;
    const password = "TestPass123!";

    const reg = await fetch(`${API}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Style" }),
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
        displayName: `Style ${suffix}`,
        languages: ["en", "bn"],
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

    // Seed a tiny subject thread (no full WhatsApp needed for 3.3 unit path)
    const fileId = newId();
    const threadId = newId();
    const subjectId = newId();
    const otherId = newId();
    const bodies = [
      "আচ্ছা ok, short reply before noon.",
      "আচ্ছা fine — dry joke then bye.",
      "kiwi tea again? আচ্ছা",
      "যাই",
      "kiwi tea again tomorrow",
    ];

    {
      const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
      try {
        // Minimal source_files row is required for participants FK — use import+presign path lightly
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
              filename: "style-seed.txt",
              mediaType: "text/plain",
              byteSize: 12,
            }),
          },
        );
        if (!pre.ok) throw new Error(`presign ${pre.status}`);
        const signed = (await pre.json()) as { fileId: string };
        // Use the real file id from presign
        const realFileId = signed.fileId;

        await db.insert(sourceParticipants).values([
          {
            id: subjectId,
            personaId: persona.id,
            fileId: realFileId,
            rawLabel: "Subject",
            role: "subject",
            retrievalAllowed: true,
          },
          {
            id: otherId,
            personaId: persona.id,
            fileId: realFileId,
            rawLabel: "Friend",
            role: "other",
            retrievalAllowed: false,
          },
        ]);
        await db.insert(sourceThreads).values({
          id: threadId,
          personaId: persona.id,
          fileId: realFileId,
          title: "style-seed",
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
            bodyHash: `h${pos}`,
            position: pos++,
          });
        }
        void fileId;
      } finally {
        await client.end({ timeout: 5 });
      }
    }

    // Unit: fake quote must drop
    const filtered = extract.filterCandidates(
      [
        { value: "uses আচ্ছা", quote: "আচ্ছা" },
        { value: "invented", quote: "I skydived on Mars yesterday" },
      ],
      bodies.join("\n"),
    );
    if (filtered.kept.length !== 1 || filtered.dropped.length !== 1) {
      throw new Error(
        `quote filter expected 1 kept / 1 dropped, got ${filtered.kept.length}/${filtered.dropped.length}`,
      );
    }
    console.log("ok fake quote dropped by quote check");

    const skipLlm = !env.openrouter.apiKey();
    if (skipLlm) {
      console.log("warn: no OPENROUTER_API_KEY — class B only");
    }

    const result = await extract.extractForPersona(persona.id, {
      skipLlm,
      maxSample: 40,
    });
    if (result.styleStats.messageCount < 5) {
      throw new Error(`expected subject messages, got ${result.styleStats.messageCount}`);
    }
    if (result.classBInserted < 1) {
      throw new Error("expected at least one class-B trait");
    }
    console.log(
      JSON.stringify({
        ok: true,
        messageCount: result.styleStats.messageCount,
        medianChars: result.styleStats.medianChars,
        classBInserted: result.classBInserted,
        classCInserted: result.classCInserted,
        classCDroppedFakeQuotes: result.classCDroppedFakeQuotes,
      }),
    );

    {
      const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
      try {
        const [t] = await db
          .select({ value: count() })
          .from(personalityTraits)
          .where(eq(personalityTraits.personaId, persona.id));
        const [e] = await db
          .select({ value: count() })
          .from(personalityEvidence);
        if (Number(t?.value ?? 0) < 1) throw new Error("no traits stored");
        if (Number(e?.value ?? 0) < 1) throw new Error("no evidence stored");
        const rows = await db.query.personalityTraits.findMany({
          where: eq(personalityTraits.personaId, persona.id),
        });
        if (rows.some((r) => r.status !== "pending_review")) {
          throw new Error("traits must start as pending_review");
        }
      } finally {
        await client.end({ timeout: 5 });
      }
    }

    console.log("ok style extract — check-style-extract passed");
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
