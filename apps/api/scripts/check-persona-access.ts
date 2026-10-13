/**
 * HTTP check: stranger → 404 PERSONA_NOT_FOUND; participant → 403 on owner actions.
 *
 * Usage (API on :4000, DB up):
 *   pnpm --filter @memora/api exec tsx scripts/check-persona-access.ts
 */
import "../src/load-env";
import { createDb, personaMemberships, users } from "@memora/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

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

async function registerVerifyLogin(email: string, password: string, name: string) {
  const reg = await fetch(`${API}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: name }),
  });
  if (!reg.ok) {
    throw new Error(`register ${email}: ${reg.status} ${await reg.text()}`);
  }
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
  if (!login.ok) {
    throw new Error(`login ${email}: ${login.status} ${await login.text()}`);
  }
  return { userId, jar };
}

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const password = "TestPass123!";

  const owner = await registerVerifyLogin(
    `access-owner-${suffix}@test.local`,
    password,
    "Access Owner",
  );
  const stranger = await registerVerifyLogin(
    `access-stranger-${suffix}@test.local`,
    password,
    "Access Stranger",
  );

  const create = await fetch(`${API}/api/v1/personas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: owner.jar.cookie,
    },
    body: JSON.stringify({
      scenario: "living",
      displayName: `Access Check ${suffix}`,
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
  if (!create.ok) {
    throw new Error(`create persona: ${create.status} ${await create.text()}`);
  }
  const persona = (await create.json()) as { id: string };
  const personaId = persona.id;

  const get = await fetch(`${API}/api/v1/personas/${personaId}`, {
    headers: { Cookie: stranger.jar.cookie },
  });
  const getBody = (await get.json()) as { error?: { code?: string } };
  if (get.status !== 404 || getBody?.error?.code !== "PERSONA_NOT_FOUND") {
    throw new Error(
      `stranger GET expected 404 PERSONA_NOT_FOUND, got ${get.status} ${JSON.stringify(getBody)}`,
    );
  }
  console.log("ok stranger GET → 404 PERSONA_NOT_FOUND");

  const del = await fetch(`${API}/api/v1/personas/${personaId}`, {
    method: "DELETE",
    headers: { Cookie: stranger.jar.cookie },
  });
  const delBody = (await del.json().catch(() => ({}))) as {
    error?: { code?: string };
  };
  if (del.status !== 404 || delBody?.error?.code !== "PERSONA_NOT_FOUND") {
    throw new Error(
      `stranger DELETE expected 404 PERSONA_NOT_FOUND, got ${del.status} ${JSON.stringify(delBody)}`,
    );
  }
  console.log("ok stranger DELETE → 404 PERSONA_NOT_FOUND");

  const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
  try {
    await db.insert(personaMemberships).values({
      id: randomUUID(),
      personaId,
      userId: stranger.userId,
      role: "participant",
      audience: "friend",
    });
  } finally {
    await client.end({ timeout: 5 });
  }

  const consents = await fetch(`${API}/api/v1/personas/${personaId}/consents`, {
    headers: { Cookie: stranger.jar.cookie },
  });
  const consentsBody = (await consents.json()) as {
    error?: { code?: string };
  };
  if (
    consents.status !== 403 ||
    consentsBody?.error?.code !== "PERSONA_FORBIDDEN"
  ) {
    throw new Error(
      `participant consents expected 403 PERSONA_FORBIDDEN, got ${consents.status} ${JSON.stringify(consentsBody)}`,
    );
  }
  console.log("ok participant consents → 403 PERSONA_FORBIDDEN");

  const getOk = await fetch(`${API}/api/v1/personas/${personaId}`, {
    headers: { Cookie: stranger.jar.cookie },
  });
  if (!getOk.ok) {
    throw new Error(
      `participant GET expected 200, got ${getOk.status} ${await getOk.text()}`,
    );
  }
  console.log("ok participant GET → 200");

  await fetch(`${API}/api/v1/personas/${personaId}`, {
    method: "DELETE",
    headers: { Cookie: owner.jar.cookie },
  });

  console.log("persona-access check passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
