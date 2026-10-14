/**
 * 3.5 — Review inbox: confirm / reject / correct.
 *
 * Usage:
 *   # API must be running on :4000
 *   pnpm --filter @memora/api exec tsx scripts/check-review-inbox.ts
 */
import "../src/load-env";
import { randomUUID } from "node:crypto";
import {
  createDb,
  memories,
  personalityTraits,
  users,
} from "@memora/db";
import { and, eq } from "drizzle-orm";
import { newId } from "../src/common/ids";

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
  const email = `review-${suffix}@test.local`;
  const password = "TestPass123!";

  const reg = await fetch(`${API}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Reviewer" }),
  });
  if (!reg.ok) throw new Error(`register ${reg.status}`);
  const { userId } = (await reg.json()) as { userId: string };

  const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
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
        displayName: `Review ${suffix}`,
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

    const traitConfirmId = newId();
    const traitRejectId = newId();
    const traitCorrectId = newId();
    const memConfirmId = newId();
    const memRejectId = newId();
    const memCorrectId = newId();

    await db.insert(personalityTraits).values([
      {
        id: traitConfirmId,
        personaId: persona.id,
        facet: "humor",
        value: "dry, brief",
        knowledgeClass: "C",
        status: "pending_review",
        confidence: 0.7,
        audience: "any",
      },
      {
        id: traitRejectId,
        personaId: persona.id,
        facet: "greeting",
        value: "always says yo",
        knowledgeClass: "C",
        status: "pending_review",
        confidence: 0.4,
        audience: "any",
      },
      {
        id: traitCorrectId,
        personaId: persona.id,
        facet: "formality",
        value: "very formal",
        knowledgeClass: "C",
        status: "pending_review",
        confidence: 0.5,
        audience: "any",
      },
    ]);

    await db.insert(memories).values([
      {
        id: memConfirmId,
        personaId: persona.id,
        domain: "biographical",
        memoryType: "semantic",
        text: "Liked cricket as a child",
        status: "pending_review",
        knowledgeClass: "C",
        confidence: 0.6,
        audience: "private",
        origin: "extracted",
        sensitivity: "none",
      },
      {
        id: memRejectId,
        personaId: persona.id,
        domain: "biographical",
        memoryType: "semantic",
        text: "Hated tea",
        status: "pending_review",
        knowledgeClass: "C",
        confidence: 0.3,
        audience: "private",
        origin: "extracted",
        sensitivity: "none",
      },
      {
        id: memCorrectId,
        personaId: persona.id,
        domain: "biographical",
        memoryType: "episodic",
        text: "Taught at Oxford",
        status: "pending_review",
        knowledgeClass: "C",
        confidence: 0.5,
        audience: "private",
        origin: "extracted",
        sensitivity: "none",
      },
    ]);

    const queue1 = await fetch(
      `${API}/api/v1/personas/${persona.id}/review-queue`,
      { headers },
    );
    if (!queue1.ok) {
      throw new Error(`queue ${queue1.status} ${await queue1.text()}`);
    }
    const q1 = (await queue1.json()) as {
      pendingCount: number;
      traits: unknown[];
      memories: unknown[];
    };
    if (q1.pendingCount !== 6) {
      throw new Error(`expected pendingCount 6, got ${q1.pendingCount}`);
    }
    console.log("ok review-queue lists pending traits + memories");

    const confTrait = await fetch(
      `${API}/api/v1/personas/${persona.id}/traits/${traitConfirmId}/decision`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "confirm" }),
      },
    );
    if (!confTrait.ok) {
      throw new Error(`confirm trait ${confTrait.status}`);
    }
    const confTraitBody = (await confTrait.json()) as {
      status: string;
      retrievalAllowed: boolean;
    };
    if (!confTraitBody.retrievalAllowed || confTraitBody.status !== "confirmed") {
      throw new Error("confirm trait did not set retrievalAllowed");
    }
    console.log("ok confirm trait → retrievalAllowed");

    const rejTrait = await fetch(
      `${API}/api/v1/personas/${persona.id}/traits/${traitRejectId}/decision`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "reject" }),
      },
    );
    if (!rejTrait.ok) throw new Error(`reject trait ${rejTrait.status}`);

    const corrTrait = await fetch(
      `${API}/api/v1/personas/${persona.id}/traits/${traitCorrectId}/decision`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "correct",
          value: "casual with close friends",
        }),
      },
    );
    if (!corrTrait.ok) throw new Error(`correct trait ${corrTrait.status}`);
    const corrTraitBody = (await corrTrait.json()) as {
      status: string;
      value: string;
      retrievalAllowed: boolean;
    };
    if (
      corrTraitBody.value !== "casual with close friends" ||
      !corrTraitBody.retrievalAllowed
    ) {
      throw new Error("correct trait failed");
    }
    console.log("ok correct trait → confirmed with new value");

    const confMem = await fetch(
      `${API}/api/v1/personas/${persona.id}/memories/${memConfirmId}/decision`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "confirm" }),
      },
    );
    if (!confMem.ok) throw new Error(`confirm memory ${confMem.status}`);
    const confMemBody = (await confMem.json()) as {
      retrievalAllowed: boolean;
      status: string;
    };
    if (!confMemBody.retrievalAllowed) {
      throw new Error("confirm memory did not set retrievalAllowed");
    }
    console.log("ok confirm memory → retrievalAllowed");

    // Confirmed bio must appear in DB as confirmed (searchBiographical gate)
    const bio = await db.query.memories.findMany({
      where: and(
        eq(memories.personaId, persona.id),
        eq(memories.domain, "biographical"),
        eq(memories.status, "confirmed"),
      ),
    });
    if (!bio.some((m) => m.id === memConfirmId)) {
      throw new Error("confirmed memory missing from confirmed set");
    }

    const rejMem = await fetch(
      `${API}/api/v1/personas/${persona.id}/memories/${memRejectId}/decision`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "reject" }),
      },
    );
    if (!rejMem.ok) throw new Error(`reject memory ${rejMem.status}`);

    const corrMem = await fetch(
      `${API}/api/v1/personas/${persona.id}/memories/${memCorrectId}/correct`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ text: "Taught at Dhaka University from 1998" }),
      },
    );
    if (!corrMem.ok) {
      throw new Error(`correct memory ${corrMem.status} ${await corrMem.text()}`);
    }
    const corrMemBody = (await corrMem.json()) as {
      id: string;
      supersedesId: string;
      retrievalAllowed: boolean;
      status: string;
    };
    if (
      !corrMemBody.retrievalAllowed ||
      corrMemBody.supersedesId !== memCorrectId
    ) {
      throw new Error("correct memory supersede failed");
    }

    const old = await db.query.memories.findFirst({
      where: eq(memories.id, memCorrectId),
    });
    if (old?.status !== "superseded") {
      throw new Error(`old memory status ${old?.status}, expected superseded`);
    }
    console.log("ok correct memory → new confirmed + old superseded");

    // Pending queue should be empty
    const queue2 = await fetch(
      `${API}/api/v1/personas/${persona.id}/review-queue`,
      { headers },
    );
    const q2 = (await queue2.json()) as { pendingCount: number };
    if (q2.pendingCount !== 0) {
      throw new Error(`expected empty queue, got ${q2.pendingCount}`);
    }
    console.log("ok review-queue empty after decisions");

    // Double-confirm should 409
    const again = await fetch(
      `${API}/api/v1/personas/${persona.id}/traits/${traitConfirmId}/decision`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "confirm" }),
      },
    );
    if (again.status !== 409) {
      throw new Error(`expected 409 on re-confirm, got ${again.status}`);
    }
    console.log("ok re-confirm pending → 409 CONFLICT");

    console.log("ok review inbox — confirm makes retrieval_allowed");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
