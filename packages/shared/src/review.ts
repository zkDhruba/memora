import { z } from "zod";

export const reviewDecisionActionSchema = z.enum([
  "confirm",
  "reject",
  "correct",
]);

export const reviewDecisionBodySchema = z
  .object({
    action: reviewDecisionActionSchema,
    /** Required when action is correct (new trait value / memory text). */
    value: z.string().min(1).max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.action === "correct" && !val.value?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "value is required when action is correct",
      });
    }
  });

export const memoryCorrectBodySchema = z.object({
  text: z.string().min(1).max(2000),
});

export type ReviewDecisionBody = z.infer<typeof reviewDecisionBodySchema>;
export type MemoryCorrectBody = z.infer<typeof memoryCorrectBodySchema>;
