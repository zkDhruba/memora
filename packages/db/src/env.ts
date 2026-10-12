import { config } from "dotenv";
import { resolve } from "node:path";

/** Load repo-root `.env`, falling back to `.env.example` for local defaults. */
export function loadRootEnv(): void {
  const root = resolve(__dirname, "../../..");
  config({ path: resolve(root, ".env"), quiet: true });
  if (!process.env.DATABASE_URL) {
    config({ path: resolve(root, ".env.example"), quiet: true });
  }
}

export function requireDatabaseUrl(): string {
  loadRootEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required. Copy .env.example to .env or export it.",
    );
  }
  return url;
}
