/**
 * Create import → upload fixture → poll GET import until terminal.
 *
 * Usage (API + worker; script boots its own worker):
 *   pnpm --filter @memora/api exec tsx scripts/check-import-progress.ts
 */
import "../src/load-env";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { createDb, users } from "@memora/db";
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

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const worker = startIngestionWorker(app.get(IngestionProcessor));

  try {
    const suffix = randomUUID().slice(0, 8);
    const email = `imp-${suffix}@test.local`;
    const password = "TestPass123!";

    const reg = await fetch(`${API}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Import" }),
    });
    if (!reg.ok) throw new Error(`register ${reg.status}`);
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
    const headers = {
      "Content-Type": "application/json",
      Cookie: jar.cookie,
    };

    const create = await fetch(`${API}/api/v1/personas`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        scenario: "living",
        displayName: `Import ${suffix}`,
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
    if (!create.ok) throw new Error(`persona ${create.status}`);
    const personaId = ((await create.json()) as { id: string }).id;

    const impRes = await fetch(`${API}/api/v1/personas/${personaId}/imports`, {
      method: "POST",
      headers,
      body: "{}",
    });
    if (!impRes.ok) throw new Error(`import ${impRes.status}`);
    const imp = (await impRes.json()) as { id: string };

    const body = readFileSync(join(fixtures, "notes.md"));
    const sha256 = createHash("sha256").update(body).digest("hex");
    const pre = (await (
      await fetch(`${API}/api/v1/personas/${personaId}/files/presign`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          importId: imp.id,
          filename: "notes.md",
          mediaType: "text/markdown",
          byteSize: body.length,
        }),
      })
    ).json()) as {
      fileId: string;
      url: string;
      headers: Record<string, string>;
    };
    await fetch(pre.url, { method: "PUT", headers: pre.headers, body });
    const done = await fetch(
      `${API}/api/v1/personas/${personaId}/files/${pre.fileId}/complete`,
      { method: "POST", headers, body: JSON.stringify({ sha256 }) },
    );
    if (!done.ok) throw new Error(`complete ${done.status}`);

    const start = Date.now();
    let lastPercent = -1;
    while (Date.now() - start < 45_000) {
      const progRes = await fetch(
        `${API}/api/v1/personas/${personaId}/imports/${imp.id}`,
        { headers: { Cookie: jar.cookie } },
      );
      if (!progRes.ok) throw new Error(`get import ${progRes.status}`);
      const prog = (await progRes.json()) as {
        terminal: boolean;
        percent: number;
        files: Array<{
          status: string;
          percent: number;
          terminal: boolean;
          chunkCount: number | null;
        }>;
      };
      if (prog.percent !== lastPercent) {
        console.log(
          "progress",
          prog.percent,
          "files",
          prog.files.map((f) => `${f.status}:${f.percent}`).join(","),
        );
        lastPercent = prog.percent;
      }
      if (prog.terminal) {
        if (prog.files.length !== 1 || !prog.files[0]?.terminal) {
          throw new Error("terminal without file terminal");
        }
        if (prog.percent !== 100) {
          throw new Error(`expected 100%, got ${prog.percent}`);
        }
        console.log(
          "ok terminal",
          prog.files[0].status,
          "chunks",
          prog.files[0].chunkCount,
        );
        console.log("import progress check passed");
        return;
      }
      await sleep(400);
    }
    throw new Error("timeout waiting for terminal import");
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
