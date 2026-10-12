import type { Response } from "express";
import { env } from "../config/env";

export function setSessionCookie(
  res: Response,
  rawToken: string,
  expiresAt: Date,
): void {
  res.cookie(env.sessionCookieName, rawToken, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(env.sessionCookieName, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
  });
}
