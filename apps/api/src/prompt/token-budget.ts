/**
 * Short-context token budgets (docs/06). Target under ~20k input tokens.
 * Trimmer never drops disclosure or hard boundaries to free space.
 */
export const TOKEN_BUDGET = {
  stableInstructions: 1_200,
  /** Voice samples + light bio; chats (retrievedSources) get the bulk of the budget. */
  styleAndIdentity: 1_600,
  relationshipAndBoundaries: 400,
  retrievedSources: 5_500,
  biographicalMemories: 800,
  conversationSummary: 600,
  recentTurns: 3_000,
  userMessage: 1_000,
  outputReserve: 800,
} as const;

export type TokenBudgetKey = keyof typeof TOKEN_BUDGET;

export const PROMPT_TEMPLATE_VERSION = "chat.v3";

/** Soft threshold for “short” user messages that append the previous turn (docs/06). */
export const SHORT_QUERY_TOKEN_THRESHOLD = 12;
