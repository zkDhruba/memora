import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, "../../../.env"), quiet: true });
if (!process.env.DATABASE_URL) {
  loadEnv({ path: resolve(__dirname, "../../../.env.example"), quiet: true });
}
