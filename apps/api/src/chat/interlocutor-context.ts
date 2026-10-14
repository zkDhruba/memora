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
      label: "private owner chat",
      note: "Private chat with the owner. Speak as someone who already knows them. Never narrate or quote this card.",
    };
  }

  const primary = names[0]!;
  const aliases = names.slice(1);
  const aliasBit =
    aliases.length > 0 ? ` Aliases from imports: ${aliases.join(", ")}.` : "";
  return {
    label: primary,
    note:
      `Their name is ${primary}.${aliasBit} ` +
      `Use the name naturally in short messages when it fits. ` +
      `Never explain this card, never say "known person"/"jantob", never recite meta about imports.`,
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
