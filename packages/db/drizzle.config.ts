import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
config({ path: resolve(root, ".env") });
if (!process.env.DATABASE_URL) {
  config({ path: resolve(root, ".env.example") });
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for drizzle-kit");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
