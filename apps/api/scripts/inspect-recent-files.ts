import "../src/load-env";
import { createDb, processingJobs, sourceFileVersions } from "@memora/db";
import { eq } from "drizzle-orm";

async function main() {
  const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
  try {
    const files = await db.query.sourceFiles.findMany({
      orderBy: (f, { desc }) => [desc(f.createdAt)],
      limit: 10,
    });
    for (const f of files) {
      const versions = await db.query.sourceFileVersions.findMany({
        where: eq(sourceFileVersions.fileId, f.id),
        orderBy: (v, { desc }) => [desc(v.generation)],
        limit: 1,
      });
      const v = versions[0];
      const jobs = v
        ? await db.query.processingJobs.findMany({
            where: eq(processingJobs.fileVersionId, v.id),
          })
        : [];
      console.log(
        JSON.stringify({
          name: f.originalFilename,
          media: f.mediaType,
          status: f.status,
          size: f.byteSize,
          report: v?.parseReport,
          jobs: jobs.map((j) => ({
            stage: j.stage,
            status: j.status,
            err: j.errorCode,
            attempts: j.attempts,
          })),
        }),
      );
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
