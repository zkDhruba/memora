import "../src/load-env";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { HybridRetrievalService } from "../src/retrieval/hybrid-retrieval.service";
import { buildStickyRetrievalQuery } from "../src/prompt/prompt-builder";
import {
  contentTokens,
  expandQueryForRetrieval,
  expandToken,
} from "../src/retrieval/query-expand";

const PERSONA_ID = "01a13455-d001-77e2-a13e-0d37d2d13e72";

async function dump(ret: HybridRetrievalService, label: string, q: string) {
  const searched = await ret.searchChunks(
    { personaId: PERSONA_ID, actorUserId: "x", audience: "private" },
    q,
    8,
  );
  console.log(`\n=== ${label} ===`);
  console.log("query:", q.replace(/\n/g, " | "));
  for (const [i, c] of searched.entries()) {
    console.log(
      `${i + 1}.`,
      c.content.slice(0, 140).replace(/\n/g, " | "),
    );
  }
}

async function main() {
  const base = "Ajin 2007 er raat a ki hoyesilo? Sidr";
  console.log("tokens", contentTokens(base));
  console.log("expanded", expandQueryForRetrieval(base));
  console.log("sidr variants", expandToken("sidr"));

  const stickyFather = buildStickyRetrievalQuery("What about your father?", [
    "Ajin 2007 er raat a ki hoyesilo? Sidr",
    "You say it what happened that night",
    "Hae",
  ]);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error"],
  });
  try {
    const ret = app.get(HybridRetrievalService);
    await dump(ret, "base Sidr", base);
    await dump(ret, "sticky father", stickyFather);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
