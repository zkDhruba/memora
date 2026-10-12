import { PLAN_CATALOG } from "@memora/shared";
import { eq } from "drizzle-orm";
import { createDb } from "./client";
import { requireDatabaseUrl } from "./env";
import { plans } from "./schema";

async function main() {
  const url = requireDatabaseUrl();
  const { db, client } = createDb(url, { max: 1 });

  for (const entry of PLAN_CATALOG) {
    const existing = await db.query.plans.findFirst({
      where: eq(plans.id, entry.id),
    });

    if (existing) {
      await db
        .update(plans)
        .set({
          displayName: entry.displayName,
          limits: entry.limits,
          sortOrder: entry.sortOrder,
          active: true,
        })
        .where(eq(plans.id, entry.id));
      console.log(`Updated plan: ${entry.id}`);
    } else {
      await db.insert(plans).values({
        id: entry.id,
        displayName: entry.displayName,
        limits: entry.limits,
        sortOrder: entry.sortOrder,
        active: true,
      });
      console.log(`Inserted plan: ${entry.id}`);
    }
  }

  const rows = await db.select().from(plans).orderBy(plans.sortOrder);
  console.log(
    "Plans:",
    rows
      .map((r) => `${r.id} (maxOwned=${r.limits.maxOwnedPersonas})`)
      .join(", "),
  );

  await client.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
