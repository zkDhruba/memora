/** Required on every retrieval call (docs/09). Prevents unscoped queries. */
export type MembershipAudience =
  | "private"
  | "family"
  | "friend"
  | "colleague"
  | "any";

export type PersonaScope = {
  personaId: string;
  actorUserId: string;
  /** Membership audience tag used for SQL audience filters. */
  audience: MembershipAudience;
};
