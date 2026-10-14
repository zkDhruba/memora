/**
 * Mark stuck PNG-as-text/plain uploads as needs_attention and complete their jobs.
 */
import "../src/load-env";
import {
  createDb,
  processingJobs,
  sourceFiles,
  sourceFileVersions,
} from "@memora/db";
import { eq, like, or } from "drizzle-orm";

async function main() {
  const { db, client } = createDb(process.env.DATABASE_URL!, { max: 1 });
  try {
    const files = await db.query.sourceFiles.findMany({
      where: or(
        like(sourceFiles.originalFilename, "%.png"),
        like(sourceFiles.originalFilename, "%.jpg"),
        like(sourceFiles.originalFilename, "%.jpeg"),
        like(sourceFiles.originalFilename, "%.webp"),
      ),
    });
    const stuck = files.filter((f) => f.status === "clean");
    console.log("stuck image-like files", stuck.length);

    for (const f of stuck) {
      await db
        .update(sourceFiles)
        .set({ status: "needs_attention" })
        .where(eq(sourceFiles.id, f.id));

      const versions = await db.query.sourceFileVersions.findMany({
        where: eq(sourceFileVersions.fileId, f.id),
      });
      for (const v of versions) {
        await db
          .update(sourceFileVersions)
          .set({
            parseReport: {
              ...(v.parseReport ?? {}),
              parse: "skipped_unsupported",
              errorCode: "UNSUPPORTED_MEDIA",
              error:
                "Screenshots/images are not supported yet. Export WhatsApp as .txt (Without media).",
              mediaType: f.mediaType,
              filename: f.originalFilename,
              processedAt: new Date().toISOString(),
            },
          })
          .where(eq(sourceFileVersions.id, v.id));

        await db
          .update(processingJobs)
          .set({
            status: "completed",
            attempts: 1,
            errorCode: "UNSUPPORTED_MEDIA",
          })
          .where(eq(processingJobs.fileVersionId, v.id));
      }
      console.log("fixed", f.originalFilename);
    }
    console.log("done");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
