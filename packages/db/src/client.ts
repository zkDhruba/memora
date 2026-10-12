import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type MemoraDb = ReturnType<typeof drizzle<typeof schema>>;

export function createSqlClient(
  connectionString: string,
  options?: { max?: number },
) {
  return postgres(connectionString, { max: options?.max ?? 10 });
}

export function createDb(
  connectionString: string,
  options?: { max?: number },
): { db: MemoraDb; client: ReturnType<typeof postgres> } {
  const client = createSqlClient(connectionString, options);
  const db = drizzle(client, { schema });
  return { db, client };
}
