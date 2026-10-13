function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  apiPort: Number(process.env.API_PORT ?? 4000),
  databaseUrl: () => required("DATABASE_URL"),
  redisUrl: () => required("REDIS_URL", "redis://localhost:6379"),
  smtpHost: process.env.SMTP_HOST ?? "localhost",
  smtpPort: Number(process.env.SMTP_PORT ?? 1025),
  smtpFrom: process.env.SMTP_FROM ?? "noreply@memora.local",
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "memora_session",
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
  isProd: process.env.NODE_ENV === "production",
  /** Passphrase or base64(32 bytes). Used for MFA secret encryption. */
  appDataKey: () =>
    required("APP_DATA_KEY", "memora-local-app-data-key-dev-only"),

  s3: {
    endpoint: () => required("S3_ENDPOINT", "http://localhost:9000"),
    /** Browser-facing endpoint (defaults to S3_ENDPOINT). */
    publicEndpoint: () =>
      process.env.S3_PUBLIC_ENDPOINT ??
      required("S3_ENDPOINT", "http://localhost:9000"),
    region: () => process.env.S3_REGION ?? "us-east-1",
    accessKey: () => required("S3_ACCESS_KEY", "memora"),
    secretKey: () => required("S3_SECRET_KEY", "memoradevpass"),
    quarantineBucket: () =>
      required("S3_BUCKET_QUARANTINE", "memora-quarantine"),
    cleanBucket: () => required("S3_BUCKET_CLEAN", "memora-clean"),
    forcePathStyle: () =>
      (process.env.S3_FORCE_PATH_STYLE ?? "true").toLowerCase() !== "false",
  },

  clamav: {
    host: () => process.env.CLAMAV_HOST ?? "localhost",
    port: () => Number(process.env.CLAMAV_PORT ?? 3310),
    /** Skip real clamd (tests only). Never use in production. */
    skip: () =>
      (process.env.CLAMAV_SKIP ?? "").toLowerCase() === "true" ||
      (process.env.CLAMAV_SKIP ?? "") === "1",
  },
};
