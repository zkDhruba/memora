import {
  createParamDecorator,
  ExecutionContext,
  HttpStatus,
} from "@nestjs/common";
import type { Request } from "express";
import { ApiException } from "../common/api-exception";
import { AUTH_REQUEST_KEY, type AuthContext } from "./auth.types";

export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req[AUTH_REQUEST_KEY];
    if (!auth) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
        "Authentication required.",
      );
    }
    return auth;
  },
);
