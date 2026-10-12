import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { resolve } from "node:path";
import { createSqlClient } from "./client";
import { requireDatabaseUrl } from "./env";

async function main() {
  const url = requireDatabaseUrl();
  const client = createSqlClient(url, { max: 1 });
  const db = drizzle(client);

  const migrationsFolder = resolve(__dirname, "../drizzle");
  console.log(`Applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log("Migrations applied.");
  await client.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
