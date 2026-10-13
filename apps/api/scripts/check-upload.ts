/**
 * End-to-end: register → persona → import → presign → PUT quarantine → complete.
 *
 * Usage (API on :4000, Silo + DB up):
 *   pnpm --filter @memora/api exec tsx scripts/check-upload.ts
 *   pnpm --filter @memora/api exec tsx scripts/check-upload.ts <existingPersonaId>
 *
 * With existing persona, set COOKIE="memora_session=..." or pass after persona id.
 */
import "../src/load-env";
import { createHash, randomUUID } from "node:crypto";
import { createDb, users } from "@memora/db";
import { eq } from "drizzle-orm";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

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

async function registerVerifyLogin(email: string, password: string) {
  const reg = await fetch(`${API}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      displayName: "Upload Check",
    }),
  });
  if (!reg.ok) {
    throw new Error(`register: ${reg.status} ${await reg.text()}`);
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
    throw new Error(`login: ${login.status} ${await login.text()}`);
  }
  return { userId, jar };
}

async function main() {
  const existingPersonaId = process.argv[2];
  const cookieArg = process.argv[3] ?? process.env.COOKIE;

  let cookie: string;
  let personaId: string;

  if (existingPersonaId && cookieArg) {
    personaId = existingPersonaId;
    cookie = cookieArg.includes("=")
      ? cookieArg
      : `memora_session=${cookieArg}`;
  } else {
    const suffix = randomUUID().slice(0, 8);
    const password = "TestPass123!";
    const { jar } = await registerVerifyLogin(
      `upload-${suffix}@test.local`,
      password,
    );
    cookie = jar.cookie;

    const create = await fetch(`${API}/api/v1/personas`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        scenario: "living",
        displayName: `Upload ${suffix}`,
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
    personaId = ((await create.json()) as { id: string }).id;
    console.log("persona", personaId);
  }

  const headers = {
    "Content-Type": "application/json",
    Cookie: cookie,
  };

  const body = Buffer.from(
    `Memora upload check ${new Date().toISOString()}\n`,
    "utf8",
  );
  const sha256 = createHash("sha256").update(body).digest("hex");

  const impRes = await fetch(`${API}/api/v1/personas/${personaId}/imports`, {
    method: "POST",
    headers,
    body: "{}",
  });
  if (!impRes.ok) {
    throw new Error(`create import: ${impRes.status} ${await impRes.text()}`);
  }
  const imp = (await impRes.json()) as { id: string };
  console.log("import", imp.id);

  const preRes = await fetch(
    `${API}/api/v1/personas/${personaId}/files/presign`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        importId: imp.id,
        filename: "check-upload.txt",
        mediaType: "text/plain",
        byteSize: body.length,
      }),
    },
  );
  if (!preRes.ok) {
    throw new Error(`presign: ${preRes.status} ${await preRes.text()}`);
  }
  const pre = (await preRes.json()) as {
    fileId: string;
    url: string;
    headers: Record<string, string>;
    objectKey: string;
    bucket: string;
  };
  console.log("presign", pre.fileId, pre.bucket, pre.objectKey);

  const put = await fetch(pre.url, {
    method: "PUT",
    headers: pre.headers,
    body,
  });
  if (!put.ok) {
    throw new Error(`PUT quarantine: ${put.status} ${await put.text()}`);
  }
  console.log("PUT ok", put.status);

  const done = await fetch(
    `${API}/api/v1/personas/${personaId}/files/${pre.fileId}/complete`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ sha256 }),
    },
  );
  if (!done.ok) {
    throw new Error(`complete: ${done.status} ${await done.text()}`);
  }
  const completed = (await done.json()) as {
    status: string;
    bucket: string;
    objectKey: string;
  };
  console.log("complete", JSON.stringify(completed));
  if (completed.status !== "clean") {
    throw new Error(`expected status clean, got ${completed.status}`);
  }

  const client = new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "memora",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "memoradevpass",
    },
  });
  // Clean file should live in clean bucket, not quarantine.
  const head = await client.send(
    new HeadObjectCommand({
      Bucket: completed.bucket,
      Key: completed.objectKey,
    }),
  );
  console.log("clean head ContentLength", head.ContentLength, completed.bucket);

  // Edge: complete without PUT → FILE_NOT_UPLOADED
  const imp2 = await fetch(`${API}/api/v1/personas/${personaId}/imports`, {
    method: "POST",
    headers,
    body: "{}",
  });
  const imp2Body = (await imp2.json()) as { id: string };
  const pre2 = await fetch(`${API}/api/v1/personas/${personaId}/files/presign`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      importId: imp2Body.id,
      filename: "ghost.txt",
      mediaType: "text/plain",
      byteSize: 4,
    }),
  });
  const pre2Body = (await pre2.json()) as { fileId: string };
  const ghost = await fetch(
    `${API}/api/v1/personas/${personaId}/files/${pre2Body.fileId}/complete`,
    { method: "POST", headers, body: "{}" },
  );
  const ghostBody = (await ghost.json()) as { error?: { code?: string } };
  if (ghost.status !== 400 || ghostBody?.error?.code !== "FILE_NOT_UPLOADED") {
    throw new Error(
      `expected FILE_NOT_UPLOADED, got ${ghost.status} ${JSON.stringify(ghostBody)}`,
    );
  }
  console.log("ok complete without PUT → FILE_NOT_UPLOADED");
  console.log("upload check passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
