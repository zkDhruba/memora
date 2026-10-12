import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from "@nestjs/common";
import type { ZodType } from "zod";

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed.",
          details: {
            fields: result.error.issues.map((issue) => ({
              path: issue.path.join("."),
              code: issue.code,
            })),
          },
        },
      });
    }
    return result.data;
  }
}
