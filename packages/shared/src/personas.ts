import { z } from "zod";

export const personaScenarioSchema = z.enum(["living", "legacy"]);
export const attestationKindSchema = z.enum(["self", "representative"]);
export const consentPurposeSchema = z.enum([
  "host_records",
  "send_to_provider",
  "extract_profile",
  "converse",
]);

export const attestationBodySchema = z.object({
  kind: attestationKindSchema,
  statement: z.string().min(10).max(4000),
  evidenceNote: z.string().max(2000).optional(),
});

export const consentGrantBodySchema = z.object({
  purpose: consentPurposeSchema,
  providerKey: z.string().min(1).max(64).optional().nullable(),
  statementVersion: z.string().min(1).max(64),
});

export const createPersonaBodySchema = z
  .object({
    scenario: personaScenarioSchema,
    displayName: z.string().min(1).max(120),
    alternateNames: z.array(z.string().min(1).max(120)).max(20).optional(),
    languages: z.array(z.string().min(2).max(16)).min(1).max(12),
    biography: z.string().max(20000).optional(),
    providerKey: z.string().min(1).max(64).optional().nullable(),
    attestation: attestationBodySchema,
    /** Optional initial consents from the create wizard. */
    consents: z.array(consentGrantBodySchema).max(8).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.scenario === "living" && val.attestation.kind !== "self") {
      ctx.addIssue({
        code: "custom",
        path: ["attestation", "kind"],
        message: "Living personas require a self attestation.",
      });
    }
    if (val.scenario === "legacy" && val.attestation.kind !== "representative") {
      ctx.addIssue({
        code: "custom",
        path: ["attestation", "kind"],
        message: "Legacy personas require a representative attestation.",
      });
    }
  });

export const updatePersonaBodySchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    alternateNames: z.array(z.string().min(1).max(120)).max(20).optional(),
    languages: z.array(z.string().min(2).max(16)).min(1).max(12).optional(),
    biography: z.string().max(20000).nullable().optional(),
    providerKey: z.string().min(1).max(64).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field is required",
  });

export type CreatePersonaBody = z.infer<typeof createPersonaBodySchema>;
export type UpdatePersonaBody = z.infer<typeof updatePersonaBodySchema>;
export type ConsentGrantBody = z.infer<typeof consentGrantBodySchema>;
export type AttestationBody = z.infer<typeof attestationBodySchema>;
