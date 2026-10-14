import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChunkingModule } from "../chunking/chunking.module";
import { JobsModule } from "../jobs/jobs.module";
import { PersonasModule } from "../personas/personas.module";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";

@Module({
  imports: [AuthModule, PersonasModule, JobsModule, ChunkingModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
