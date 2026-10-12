/** Account plan ids — keep in sync with seeded `plans` table (Phase 1.3). */
export const PLAN_IDS = ["free", "pro", "pro_plus"] as const;

export type PlanId = (typeof PLAN_IDS)[number];
