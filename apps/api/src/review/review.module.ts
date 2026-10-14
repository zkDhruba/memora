import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PersonasModule } from "../personas/personas.module";
import { ReviewController } from "./review.controller";
import { ReviewService } from "./review.service";

@Module({
  imports: [AuthModule, PersonasModule],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
