import { Module } from "@nestjs/common";
import { ChunkPersistService } from "./chunk-persist.service";

@Module({
  providers: [ChunkPersistService],
  exports: [ChunkPersistService],
})
export class ChunkingModule {}
