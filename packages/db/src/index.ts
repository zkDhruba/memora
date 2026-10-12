export const DB_PACKAGE = "@memora/db" as const;

export * from "./schema";
export { createDb, createSqlClient, type MemoraDb } from "./client";
