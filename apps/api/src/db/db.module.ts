import { Global, Inject, Module, OnModuleDestroy } from "@nestjs/common";
import { createDb, type MemoraDb } from "@memora/db";
import { env } from "../config/env";
import { DB, DB_CLIENT } from "./db.tokens";

export type DbBundle = ReturnType<typeof createDb>;

@Global()
@Module({
  providers: [
    {
      provide: DB_CLIENT,
      useFactory: (): DbBundle => createDb(env.databaseUrl()),
    },
    {
      provide: DB,
      useFactory: (bundle: DbBundle) => bundle.db,
      inject: [DB_CLIENT],
    },
  ],
  exports: [DB, DB_CLIENT],
})
export class DbModule implements OnModuleDestroy {
  constructor(@Inject(DB_CLIENT) private readonly bundle: DbBundle) {}

  async onModuleDestroy() {
    await this.bundle.client.end({ timeout: 5 });
  }
}

// Re-export for typing without importing postgres in consumers.
export type { MemoraDb };
