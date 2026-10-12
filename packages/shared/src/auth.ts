import { z } from "zod";

export const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(128),
  displayName: z.string().min(1).max(80),
});

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
  totp: z.string().length(6).optional(),
});

export const verifyEmailBodySchema = z.object({
  token: z.string().min(1).max(512),
});

export const forgotPasswordBodySchema = z.object({
  email: z.string().email(),
});

export const resetPasswordBodySchema = z.object({
  token: z.string().min(1).max(512),
  password: z.string().min(10).max(128),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type VerifyEmailBody = z.infer<typeof verifyEmailBodySchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
