/**
 * Upload both WhatsApp date fixtures → parse → subject mapping.
 *
 * Usage (API on :4000; script boots its own worker):
 *   pnpm --filter @memora/api exec tsx scripts/check-whatsapp.ts
 */
import "../src/load-env";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import {
  createDb,
  sourceFiles,
  sourceMessages,
  sourceParticipants,
  sourceThreads,
  users,
} from "@memora/db";
import { eq } from "drizzle-orm";
import { AppModule } from "../src/app.module";
import { IngestionProcessor } from "../src/jobs/ingestion.processor";
import { startIngestionWorker } from "../src/jobs/ingestion.worker";

const API = process.env.API_URL ?? "http://localhost:4000";
const fixtures = join(__dirname, "../fixtures");

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

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function registerVerifyLogin(email: string, password: string) {
  const reg = await fetch(`${API}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      displayName: "WhatsApp Check",
    }),
  });
  if (!reg.ok) throw new Error(`register: ${reg.status} ${await reg.text()}`);
  const { userId } = (await reg.json()) as { userId: string };

  const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
  try {
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, userId));
  } finally {
    await client.end({ timeout: 5 });
  }

  const jar: Jar = { cookie: "" };
  const login = await fetch(`${API}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  captureCookies(login, jar);
  if (!login.ok) throw new Error(`login: ${login.status} ${await login.text()}`);
  return jar;
}

async function upload(
  cookie: string,
  personaId: string,
  filename: string,
  body: Buffer,
) {
  const headers = {
    "Content-Type": "application/json",
    Cookie: cookie,
  };
  const sha256 = createHash("sha256").update(body).digest("hex");
  const impRes = await fetch(`${API}/api/v1/personas/${personaId}/imports`, {
    method: "POST",
    headers,
    body: "{}",
  });
  if (!impRes.ok) throw new Error(`import: ${impRes.status}`);
  const imp = (await impRes.json()) as { id: string };
  const preRes = await fetch(
    `${API}/api/v1/personas/${personaId}/files/presign`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        importId: imp.id,
        filename,
        mediaType: "text/plain",
        byteSize: body.length,
      }),
    },
  );
  if (!preRes.ok) throw new Error(`presign: ${preRes.status} ${await preRes.text()}`);
  const pre = (await preRes.json()) as {
    fileId: string;
    url: string;
    headers: Record<string, string>;
  };
  const put = await fetch(pre.url, {
    method: "PUT",
    headers: pre.headers,
    body,
  });
  if (!put.ok) throw new Error(`PUT: ${put.status}`);
  const done = await fetch(
    `${API}/api/v1/personas/${personaId}/files/${pre.fileId}/complete`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ sha256 }),
    },
  );
  if (!done.ok) throw new Error(`complete: ${done.status} ${await done.text()}`);
  return pre.fileId;
}

async function waitNeedsMapping(fileId: string, timeoutMs = 45_000) {
  const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
  const start = Date.now();
  try {
    while (Date.now() - start < timeoutMs) {
      const file = await db.query.sourceFiles.findFirst({
        where: eq(sourceFiles.id, fileId),
      });
      const parts = await db.query.sourceParticipants.findMany({
        where: eq(sourceParticipants.fileId, fileId),
      });
      if (file && parts.length >= 2 && file.subjectParticipantId == null) {
        const thread = await db.query.sourceThreads.findFirst({
          where: eq(sourceThreads.fileId, fileId),
        });
        if (!thread) throw new Error("missing thread");
        const msgs = await db.query.sourceMessages.findMany({
          where: eq(sourceMessages.threadId, thread.id),
        });
        if (msgs.filter((m) => m.kind === "speech").length < 1) {
          throw new Error("no speech messages");
        }
        return { file, parts, msgs };
      }
      await sleep(250);
    }
    throw new Error(`timeout waiting for WhatsApp parse on ${fileId}`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const worker = startIngestionWorker(app.get(IngestionProcessor));

  try {
    const suffix = randomUUID().slice(0, 8);
    const jar = await registerVerifyLogin(
      `wa-${suffix}@test.local`,
      "TestPass123!",
    );
    const cookie = jar.cookie;

    const create = await fetch(`${API}/api/v1/personas`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        scenario: "living",
        displayName: `WA ${suffix}`,
        languages: ["en"],
        attestation: {
          kind: "self",
          statement: "I am creating this persona for myself.",
        },
        consents: [
          { purpose: "host_records", statementVersion: "v1" },
          { purpose: "converse", statementVersion: "v1" },
        ],
      }),
    });
    if (!create.ok) throw new Error(`persona: ${create.status}`);
    const personaId = ((await create.json()) as { id: string }).id;
    console.log("persona", personaId);

    const bracketId = await upload(
      cookie,
      personaId,
      "_chat.txt",
      readFileSync(join(fixtures, "whatsapp-bracketed.txt")),
    );
    const dashId = await upload(
      cookie,
      personaId,
      "whatsapp-dashed.txt",
      readFileSync(join(fixtures, "whatsapp-dashed.txt")),
    );

    const bracket = await waitNeedsMapping(bracketId);
    console.log(
      "ok bracketed parse",
      "participants",
      bracket.parts.map((p) => p.rawLabel).join(","),
      "msgs",
      bracket.msgs.length,
    );

    const dash = await waitNeedsMapping(dashId);
    console.log(
      "ok dashed parse",
      "participants",
      dash.parts.map((p) => p.rawLabel).join(","),
      "msgs",
      dash.msgs.length,
    );

    const alice = bracket.parts.find((p) => p.rawLabel === "Alice");
    if (!alice) throw new Error("Alice missing");

    const partsRes = await fetch(
      `${API}/api/v1/personas/${personaId}/files/${bracketId}/participants`,
      { headers: { Cookie: cookie } },
    );
    if (!partsRes.ok) throw new Error(`participants: ${partsRes.status}`);
    const partsBody = (await partsRes.json()) as {
      needsSubjectMapping: boolean;
      data: { id: string; rawLabel: string }[];
    };
    if (!partsBody.needsSubjectMapping) {
      throw new Error("expected needsSubjectMapping");
    }

    const mapRes = await fetch(
      `${API}/api/v1/personas/${personaId}/files/${bracketId}/subject-mapping`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ participantId: alice.id }),
      },
    );
    if (!mapRes.ok) {
      throw new Error(`map: ${mapRes.status} ${await mapRes.text()}`);
    }
    const mapped = (await mapRes.json()) as {
      status: string;
      subjectLabel: string;
    };
    if (mapped.status !== "parsed" || mapped.subjectLabel !== "Alice") {
      throw new Error(`bad map response ${JSON.stringify(mapped)}`);
    }

    const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
    try {
      const file = await db.query.sourceFiles.findFirst({
        where: eq(sourceFiles.id, bracketId),
      });
      const parts = await db.query.sourceParticipants.findMany({
        where: eq(sourceParticipants.fileId, bracketId),
      });
      if (file?.status !== "parsed" || file.subjectParticipantId !== alice.id) {
        throw new Error("file not marked parsed with subject");
      }
      const byLabel = Object.fromEntries(
        parts.map((p) => [p.rawLabel, p]),
      );
      if (byLabel.Alice?.role !== "subject" || byLabel.Bob?.role !== "other") {
        throw new Error(`roles ${JSON.stringify(byLabel)}`);
      }
      if (
        byLabel.Alice?.retrievalAllowed !== true ||
        byLabel.Bob?.retrievalAllowed !== false
      ) {
        throw new Error(
          `retrieval_allowed expected Alice=true Bob=false, got ${JSON.stringify(byLabel)}`,
        );
      }
    } finally {
      await client.end({ timeout: 5 });
    }

    console.log("ok subject mapping Alice → subject+retrievable, Bob → other+blocked");
    console.log("whatsapp check passed");
  } finally {
    await worker.close();
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
