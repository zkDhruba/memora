/** Account plan ids — keep in sync with seeded `plans` table (Phase 1.3). */
export const PLAN_IDS = ["free", "pro", "pro_plus"] as const;

export type PlanId = (typeof PLAN_IDS)[number];

/** Shape of `plans.limits` JSONB. `null` means unlimited / not enforced. */
export type PlanLimits = {
  maxOwnedPersonas: number;
  maxChatMemoryMessages: number;
  maxChatMessagesPerDay: number | null;
  maxMembersPerPersona: number | null;
  maxUploadMbPerMonth: number | null;
  features: {
    legacyScenario: boolean;
    export: boolean;
  };
};

export type PlanCatalogEntry = {
  id: PlanId;
  displayName: string;
  sortOrder: number;
  limits: PlanLimits;
};

/** Seed catalog — source of truth for `pnpm db:seed`. */
export const PLAN_CATALOG: readonly PlanCatalogEntry[] = [
  {
    id: "free",
    displayName: "Free",
    sortOrder: 10,
    limits: {
      maxOwnedPersonas: 1,
      maxChatMemoryMessages: 100,
      maxChatMessagesPerDay: 25,
      maxMembersPerPersona: null,
      maxUploadMbPerMonth: null,
      features: { legacyScenario: false, export: false },
    },
  },
  {
    id: "pro",
    displayName: "Pro",
    sortOrder: 20,
    limits: {
      maxOwnedPersonas: 5,
      maxChatMemoryMessages: 1000,
      maxChatMessagesPerDay: 100,
      maxMembersPerPersona: null,
      maxUploadMbPerMonth: null,
      features: { legacyScenario: false, export: false },
    },
  },
  {
    id: "pro_plus",
    displayName: "Pro+",
    sortOrder: 30,
    limits: {
      maxOwnedPersonas: 20,
      maxChatMemoryMessages: 10000,
      maxChatMessagesPerDay: null,
      maxMembersPerPersona: null,
      maxUploadMbPerMonth: null,
      features: { legacyScenario: true, export: false },
    },
  },
] as const;
