import { z } from "zod";

export const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(128),
  displayName: z.string().min(1).max(80),
});

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
  /** 6-digit TOTP when MFA is enabled. */
  totp: z.string().length(6).optional(),
  /** Alternate to totp — unused recovery code (with or without dashes). */
  recoveryCode: z.string().min(8).max(64).optional(),
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

export const mfaConfirmBodySchema = z.object({
  code: z.string().length(6),
});

export const mfaStepUpBodySchema = z.object({
  totp: z.string().length(6).optional(),
  recoveryCode: z.string().min(8).max(64).optional(),
}).refine((v) => Boolean(v.totp || v.recoveryCode), {
  message: "totp or recoveryCode is required",
});

export const deleteMeBodySchema = z.object({
  password: z.string().min(1).max(128),
  totp: z.string().length(6).optional(),
  recoveryCode: z.string().min(8).max(64).optional(),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type VerifyEmailBody = z.infer<typeof verifyEmailBodySchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
export type MfaConfirmBody = z.infer<typeof mfaConfirmBodySchema>;
export type MfaStepUpBody = z.infer<typeof mfaStepUpBodySchema>;
export type DeleteMeBody = z.infer<typeof deleteMeBodySchema>;
