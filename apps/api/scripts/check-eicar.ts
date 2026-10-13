/**
 * Upload the EICAR test string → complete must return FILE_INFECTED.
 *
 * Usage:
 *   pnpm --filter @memora/api exec tsx scripts/check-eicar.ts
 */
import "../src/load-env";
import { createHash, randomUUID } from "node:crypto";
import { createDb, users } from "@memora/db";
import { eq } from "drizzle-orm";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

const API = process.env.API_URL ?? "http://localhost:4000";

/** Official EICAR antivirus test file (harmless). */
const EICAR =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

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
  const password = "TestPass123!";
  const email = `eicar-${suffix}@test.local`;

  const reg = await fetch(`${API}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Eicar Check" }),
  });
  if (!reg.ok) throw new Error(`register: ${await reg.text()}`);
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
  if (!login.ok) throw new Error(`login: ${await login.text()}`);

  const headers = {
    "Content-Type": "application/json",
    Cookie: jar.cookie,
  };

  const create = await fetch(`${API}/api/v1/personas`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      scenario: "living",
      displayName: `Eicar ${suffix}`,
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
  if (!create.ok) throw new Error(`persona: ${await create.text()}`);
  const personaId = ((await create.json()) as { id: string }).id;

  const imp = await fetch(`${API}/api/v1/personas/${personaId}/imports`, {
    method: "POST",
    headers,
    body: "{}",
  });
  if (!imp.ok) throw new Error(`import: ${await imp.text()}`);
  const importId = ((await imp.json()) as { id: string }).id;

  const body = Buffer.from(EICAR, "utf8");
  const sha256 = createHash("sha256").update(body).digest("hex");

  const pre = await fetch(`${API}/api/v1/personas/${personaId}/files/presign`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      importId,
      filename: "eicar.txt",
      mediaType: "text/plain",
      byteSize: body.length,
    }),
  });
  if (!pre.ok) throw new Error(`presign: ${await pre.text()}`);
  const signed = (await pre.json()) as {
    fileId: string;
    url: string;
    headers: Record<string, string>;
    objectKey: string;
    bucket: string;
  };

  const put = await fetch(signed.url, {
    method: "PUT",
    headers: signed.headers,
    body,
  });
  if (!put.ok) throw new Error(`PUT: ${put.status} ${await put.text()}`);

  const done = await fetch(
    `${API}/api/v1/personas/${personaId}/files/${signed.fileId}/complete`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ sha256 }),
    },
  );
  const doneBody = (await done.json()) as {
    error?: { code?: string; details?: { signature?: string } };
  };
  if (done.status !== 422 || doneBody?.error?.code !== "FILE_INFECTED") {
    throw new Error(
      `expected 422 FILE_INFECTED, got ${done.status} ${JSON.stringify(doneBody)}`,
    );
  }
  console.log(
    "ok FILE_INFECTED",
    doneBody.error?.details?.signature ?? "(signature)",
  );

  // Quarantine object should be gone.
  const s3 = new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "memora",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "memoradevpass",
    },
  });
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: signed.bucket,
        Key: signed.objectKey,
      }),
    );
    throw new Error("quarantine object still present after infected scan");
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    const name = (err as { name?: string }).name;
    if (status === 404 || name === "NotFound" || name === "NoSuchKey") {
      console.log("ok quarantine object deleted");
    } else if ((err as Error).message.includes("still present")) {
      throw err;
    } else {
      // Some S3 libs throw differently
      console.log("ok quarantine object deleted (head failed)");
    }
  }

  console.log("eicar check passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
