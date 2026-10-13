import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlansModule } from "../plans/plans.module";
import { PersonaAccessService } from "./persona-access.service";
import { PersonasController } from "./personas.controller";
import { PersonasService } from "./personas.service";

@Module({
  imports: [AuthModule, PlansModule],
  controllers: [PersonasController],
  providers: [PersonaAccessService, PersonasService],
  exports: [PersonasService, PersonaAccessService],
})
export class PersonasModule {}
