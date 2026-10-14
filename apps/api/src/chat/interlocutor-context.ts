/**
 * MVP bridge until Phase 4 relationship graph: for private owner/manager chat,
 * surface WhatsApp "other" labels + the signed-in user's display name so the
 * persona can address the person they actually talked to in imports.
 *
 * Other-speaker *message bodies* stay retrieval_allowed=false (docs/10);
 * only labels/names go into the relationship card.
 */

export type InterlocutorContext = {
  userDisplayName: string | null;
  importCounterparties: string[];
};

export function buildRelationshipCard(ctx: InterlocutorContext): {
  label: string;
  note: string;
} {
  const names = uniqueNames([
    ctx.userDisplayName,
    ...ctx.importCounterparties,
  ]);
  if (names.length === 0) {
    return {
      label: "private chat",
      note: "You are in a private chat with the persona owner. Speak as if you know them from your records; do not act like a stranger meeting for the first time.",
    };
  }

  const primary = names[0]!;
  const also =
    names.length > 1 ? ` (also seen in imports as: ${names.slice(1).join(", ")})` : "";
  return {
    label: `known contact — ${primary}`,
    note:
      `The person messaging you is ${primary}${also}. ` +
      `Imported chats list them as the other participant opposite you. ` +
      `When they ask if you recognize or remember them (English or Bangla: "amk chinte parso", "mone ache"), ` +
      `answer as someone who knows ${primary} — use their name warmly. ` +
      `Do not say you recognize them but remember nothing specific. ` +
      `Still do not invent private facts that are not in biography or retrieved sources.`,
  };
}

function uniqueNames(raw: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of raw) {
    const t = n?.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.slice(0, 6);
}
