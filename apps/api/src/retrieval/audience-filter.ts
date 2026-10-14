import type { MembershipAudience } from "./persona-scope";

/**
 * Restrictiveness rank (higher = more privileged / sees more).
 * Member can see content when memberRank >= contentRank
 * (docs/08: private is owner/manager; participants see their tier and broader).
 */
const AUDIENCE_RANK: Record<MembershipAudience, number> = {
  private: 4,
  family: 3,
  friend: 2,
  colleague: 1,
  any: 0,
};

export function audienceRank(audience: MembershipAudience): number {
  return AUDIENCE_RANK[audience];
}

/** True when a member with `memberAudience` may see content tagged `contentAudience`. */
export function audienceAllows(
  memberAudience: MembershipAudience,
  contentAudience: MembershipAudience,
): boolean {
  return audienceRank(memberAudience) >= audienceRank(contentAudience);
}

/**
 * Content audiences visible to this membership (for SQL `IN (...)`).
 * Order is stable for test snapshots.
 */
export function visibleContentAudiences(
  memberAudience: MembershipAudience,
): MembershipAudience[] {
  const rank = audienceRank(memberAudience);
  return (
    Object.entries(AUDIENCE_RANK) as [MembershipAudience, number][]
  )
    .filter(([, r]) => r <= rank)
    .map(([a]) => a)
    .sort((a, b) => audienceRank(b) - audienceRank(a));
}
