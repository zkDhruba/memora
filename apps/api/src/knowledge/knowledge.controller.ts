import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentAuth } from "../auth/current-auth.decorator";
import type { AuthContext } from "../auth/auth.types";
import { SessionGuard } from "../auth/session.guard";
import { KnowledgeService } from "./knowledge.service";

@Controller("personas/:personaId/knowledge")
@UseGuards(SessionGuard)
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  /** Embed chunks + extract style/memory from imported sources (sync). */
  @Post("rebuild")
  rebuild(
    @CurrentAuth() auth: AuthContext,
    @Param("personaId") personaId: string,
  ) {
    return this.knowledge.rebuildFromImports(auth.user.id, personaId);
  }
}
