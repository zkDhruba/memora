import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlansModule } from "../plans/plans.module";
import { PersonasController } from "./personas.controller";
import { PersonasService } from "./personas.service";

@Module({
  imports: [AuthModule, PlansModule],
  controllers: [PersonasController],
  providers: [PersonasService],
  exports: [PersonasService],
})
export class PersonasModule {}
