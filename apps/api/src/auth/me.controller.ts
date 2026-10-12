import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentAuth } from "./current-auth.decorator";
import type { AuthContext } from "./auth.types";
import { MeService } from "./me.service";
import { SessionGuard } from "./session.guard";

@Controller("me")
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  @UseGuards(SessionGuard)
  getMe(@CurrentAuth() auth: AuthContext) {
    return this.me.getMe(auth.user);
  }
}
