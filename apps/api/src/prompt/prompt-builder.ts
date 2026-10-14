import type { LlmMessage } from "../llm/llm.types";
import { estimateTokens } from "./estimate-tokens";
import {
  PROMPT_TEMPLATE_VERSION,
  SHORT_QUERY_TOKEN_THRESHOLD,
  TOKEN_BUDGET,
} from "./token-budget";
import { DISCLOSURE_SENTENCE, buildStableInstructions } from "./stable-instructions";
import {
  clampTextToBudget,
  trimScoredToBudget,
  trimTurnsToBudget,
} from "./token-trimmer";

export type PromptChunkInput = {
  chunkId: string;
  content: string;
  sourceKind: string;
  speakerRole: string;
  score: number;
  timeLabel?: string | null;
};

export type PromptMemoryInput = {
  memoryId: string;
  text: string;
  score: number;
};

export type PromptTurn = {
  role: "user" | "assistant";
  content: string;
};

export type PromptBuildInput = {
  displayName: string;
  languages: string[];
  scenario: "living" | "legacy";
  /** Owner-written biography (identity grounding even before review). */
  biography?: string | null;
  /** Query-selected biography paragraphs (hybrid retrieval does not search bio text). */
  biographyPassages?: string[];
  /** Compiled personality card (JSON-serializable). */
  styleCard: Record<string, unknown> | string;
  /** Up to 8 short approved excerpts. */
  styleExcerpts?: string[];
  styleEvidenceLimited?: boolean;
  relationship?: { label: string; note?: string } | "neutral";
  /** Hard boundaries — never dropped by the trimmer. */
  boundaries?: string[];
  chunks: PromptChunkInput[];
  memories: PromptMemoryInput[];
  conversationSummary?: string | null;
  recentTurns?: PromptTurn[];
  userMessage: string;
  /** Appended when userMessage is under 12 tokens (docs/06). */
  previousUserMessage?: string | null;
  /** True when persona has imported retrieval-allowed chunks (even if none retrieved this turn). */
  hasImportedRecords?: boolean;
};

export type PromptTokenBreakdown = {
  stableInstructions: number;
  styleAndIdentity: number;
  relationshipAndBoundaries: number;
  retrievedSources: number;
  biographicalMemories: number;
  conversationSummary: number;
  recentTurns: number;
  userMessage: number;
  totalInputEstimate: number;
};

export type BuiltPrompt = {
  messages: LlmMessage[];
  systemPrompt: string;
  /** Marker id (c1) → chunk UUID. */
  citationMap: Record<string, string>;
  /** Marker id (m1) → memory UUID. */
  memoryMap: Record<string, string>;
  retrievalQuery: string;
  trimmed: {
    droppedChunkIds: string[];
    droppedMemoryIds: string[];
    droppedTurnCount: number;
  };
  tokens: PromptTokenBreakdown;
  templateVersion: string;
  /** Always true — callers can assert disclosure survived trimming. */
  disclosurePresent: boolean;
};

/**
 * Assemble a budgeted chat prompt (3.7). Pure function — no I/O.
 * Drops lowest-scoring retrieval first; never removes disclosure or boundaries.
 */
export function buildChatPrompt(input: PromptBuildInput): BuiltPrompt {
  const retrievalQuery = buildRetrievalQuery(
    input.userMessage,
    input.previousUserMessage,
  );

  const stable = clampTextToBudget(
    buildStableInstructions(input.displayName),
    TOKEN_BUDGET.stableInstructions,
  );

  const identityStyle = clampTextToBudget(
    buildIdentityAndStyleBlock(input),
    TOKEN_BUDGET.styleAndIdentity,
  );

  const relationshipBoundaries = buildRelationshipBoundariesBlock(input);
  // Boundaries + disclosure companion text are protected: if over budget, truncate
  // the relationship note first, then clamp — but keep every boundary line.
  const rbClamped = clampProtectedBoundaries(
    relationshipBoundaries,
    TOKEN_BUDGET.relationshipAndBoundaries,
    input.boundaries ?? [],
  );

  const sourceWrapped = input.chunks.map((c, i) => {
    const marker = `c${i + 1}`;
    const body = wrapSource({
      id: marker,
      kind: c.sourceKind,
      time: c.timeLabel ?? undefined,
      speaker: c.speakerRole,
      text: c.content,
    });
    return { id: c.chunkId, marker, text: body, score: c.score };
  });
  const sourcesTrim = trimScoredToBudget(
    sourceWrapped,
    TOKEN_BUDGET.retrievedSources,
  );

  const memoryWrapped = input.memories.map((m, i) => {
    const marker = `m${i + 1}`;
    const body = wrapSource({
      id: marker,
      kind: "memory",
      text: m.text,
    });
    return { id: m.memoryId, marker, text: body, score: m.score };
  });
  const memoriesTrim = trimScoredToBudget(
    memoryWrapped,
    TOKEN_BUDGET.biographicalMemories,
  );

  // Re-number markers after trim so citation ids stay dense c1..cn / m1..mn
  const citationMap: Record<string, string> = {};
  const sourcesBlockParts: string[] = [];
  sourcesTrim.kept.forEach((s, i) => {
    const marker = `c${i + 1}`;
    citationMap[marker] = s.id;
    sourcesBlockParts.push(
      s.text.replace(/id="c\d+"/, `id="${marker}"`),
    );
  });

  const memoryMap: Record<string, string> = {};
  const memoriesBlockParts: string[] = [];
  memoriesTrim.kept.forEach((m, i) => {
    const marker = `m${i + 1}`;
    memoryMap[marker] = m.id;
    memoriesBlockParts.push(
      m.text.replace(/id="m\d+"/, `id="${marker}"`),
    );
  });

  const summary = clampTextToBudget(
    input.conversationSummary
      ? `Conversation summary:\n${input.conversationSummary}`
      : "",
    TOKEN_BUDGET.conversationSummary,
  );

  const turnsTrim = trimTurnsToBudget(
    input.recentTurns ?? [],
    TOKEN_BUDGET.recentTurns,
  );

  const userClamped = clampTextToBudget(
    input.userMessage,
    TOKEN_BUDGET.userMessage,
  );

  const systemPrompt = [
    stable.text,
    identityStyle.text,
    rbClamped.text,
    sourcesBlockParts.length
      ? `Retrieved sources (PRIMARY facts for this reply — paraphrase in first person; do not ignore them):\n${sourcesBlockParts.join("\n")}\n\nThis turn: if any source names an event, year, person, or what YOU said (e.g. Sidor/Sidr 2007, bap/nirjatito), your reply must include that concrete fact in first person. Vague filler without it is wrong.`
      : input.hasImportedRecords
        ? "Retrieved sources: (none this turn). Chat imports exist — stay in-character from voice samples; do not claim total amnesia; do not invent episodes. Say this specific detail is not loaded if needed."
        : "Retrieved sources: (none)",
    memoriesBlockParts.length
      ? `Biographical memories:\n${memoriesBlockParts.join("\n")}`
      : "",
    summary.text,
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: LlmMessage[] = [{ role: "system", content: systemPrompt }];
  for (const t of turnsTrim.kept) {
    messages.push({ role: t.role, content: t.content });
  }
  // Put a last-moment reminder beside the user turn so the model cannot bury sources.
  if (sourcesBlockParts.length) {
    messages.push({
      role: "system",
      content:
        "Answer from Retrieved sources above. Prefer concrete facts over vague emotion. No interview closer.",
    });
  }
  messages.push({ role: "user", content: userClamped.text });

  const tokens: PromptTokenBreakdown = {
    stableInstructions: stable.tokens,
    styleAndIdentity: identityStyle.tokens,
    relationshipAndBoundaries: rbClamped.tokens,
    retrievedSources: sourcesTrim.tokens,
    biographicalMemories: memoriesTrim.tokens,
    conversationSummary: summary.tokens,
    recentTurns: turnsTrim.tokens,
    userMessage: userClamped.tokens,
    totalInputEstimate: estimateTokens(
      systemPrompt +
        turnsTrim.kept.map((t) => t.content).join("") +
        userClamped.text,
    ),
  };

  return {
    messages,
    systemPrompt,
    citationMap,
    memoryMap,
    retrievalQuery,
    trimmed: {
      droppedChunkIds: sourcesTrim.droppedIds,
      droppedMemoryIds: memoriesTrim.droppedIds,
      droppedTurnCount: turnsTrim.droppedCount,
    },
    tokens,
    templateVersion: PROMPT_TEMPLATE_VERSION,
    disclosurePresent: systemPrompt.includes(DISCLOSURE_SENTENCE),
  };
}

export function buildRetrievalQuery(
  userMessage: string,
  previousUserMessage?: string | null,
): string {
  const current = userMessage.trim();
  if (!current) return (previousUserMessage ?? "").trim();
  if (
    estimateTokens(current) < SHORT_QUERY_TOKEN_THRESHOLD &&
    previousUserMessage?.trim()
  ) {
    return `${previousUserMessage.trim()}\n${current}`;
  }
  return current;
}

/**
 * Keep last user turns in the retrieval query so follow-ups ("hae", "what about
 * your father?") do not drop anchors like Sidr / 2007 from earlier in the thread.
 */
export function buildStickyRetrievalQuery(
  userMessage: string,
  recentUserMessages: string[],
  maxTurns = 3,
): string {
  const current = userMessage.trim();
  const prior = recentUserMessages
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(-maxTurns);
  if (prior.length === 0) return current;
  // Avoid duplicating the current message if it was already appended by caller.
  const withoutDup = prior[prior.length - 1] === current ? prior.slice(0, -1) : prior;
  return [...withoutDup, current].filter(Boolean).join("\n").slice(0, 1_400);
}

function buildIdentityAndStyleBlock(input: PromptBuildInput): string {
  const langs =
    input.languages.length > 0 ? input.languages.join(", ") : "unspecified";
  const card =
    typeof input.styleCard === "string"
      ? input.styleCard
      : JSON.stringify(input.styleCard, null, 0);
  const excerpts = (input.styleExcerpts ?? []).slice(0, 12);
  // Chats first: voice samples dominate this block. Bio is optional/light.
  const bioRaw = input.biography?.trim() ?? "";
  const hasChats = (input.hasImportedRecords ?? false) || excerpts.length > 0;
  const bioPrefix = !bioRaw
    ? ""
    : hasChats
      ? bioRaw.length > 400
        ? `${bioRaw.slice(0, 400).trim()}…`
        : bioRaw
      : bioRaw.length > 900
        ? `${bioRaw.slice(0, 900).trim()}…`
        : bioRaw;
  const bioHits = hasChats
    ? (input.biographyPassages ?? []).slice(0, 2)
    : (input.biographyPassages ?? []).slice(0, 3);
  const lines = [
    `You are "${input.displayName}" in this chat (scenario ${input.scenario}; languages: ${langs}).`,
  ];
  if (excerpts.length) {
    lines.push(
      "Voice samples from your own chat records (PRIMARY for cadence — imitate length and code-mixing; do not copy verbatim unless it fits):",
    );
    for (const e of excerpts) {
      lines.push(`- ${e}`);
    }
  }
  lines.push(
    "Example of BAD reply: \"I'm Persephone. I share the story of Ajin… She grew up… Feel free to ask!\"",
    "Example of BAD reply: \"Haha, maybe a little! We've had some fun moments together. It's always nice to chat with you. What have you been up to lately?\"",
    "Example of BAD reply to \"Amk chinte parso?\": \"Ami tomake chinte pari, kintu specific kichu mone porche na.\"",
    `Example of GOOD reply shape: short WhatsApp-like lines (e.g. "Hm\\nKi bolcho\\nDhruba...") matching the voice samples — first person, no helpdesk closer.`,
    input.styleEvidenceLimited
      ? "Style evidence is limited — keep replies short and first-person; do not invent mannerisms; do not sound like a helpdesk bot."
      : "Style card (secondary — voice samples win on cadence):",
    input.styleEvidenceLimited ? "" : card || "{}",
  );
  if (bioHits.length) {
    lines.push(
      "Optional owner biography snippets (SECONDARY — use only if Retrieved sources do not answer):",
    );
    for (const p of bioHits) {
      lines.push(`- ${p}`);
    }
  }
  if (bioPrefix) {
    lines.push(
      `Optional biography sketch (SECONDARY, may be empty for many personas — retell in first person if used):\n${bioPrefix}`,
    );
  } else if (!hasChats) {
    lines.push("Biography notes: (none yet). Rely on chats when imports exist.");
  }
  return lines.filter(Boolean).join("\n");
}

function buildRelationshipBoundariesBlock(input: PromptBuildInput): string {
  const rel =
    !input.relationship || input.relationship === "neutral"
      ? "Relationship: neutral."
      : `Relationship: ${input.relationship.label}${
          input.relationship.note ? ` — ${input.relationship.note}` : ""
        }.`;
  const boundaries = input.boundaries?.length
    ? `Hard boundaries (never violate):\n${input.boundaries
        .map((b) => `- ${b}`)
        .join("\n")}`
    : "Hard boundaries: none listed beyond product disclosure.";
  return `${rel}\n${boundaries}`;
}

/**
 * Prefer truncating the relationship line over dropping boundary bullets.
 */
function clampProtectedBoundaries(
  full: string,
  budget: number,
  boundaries: string[],
): { text: string; tokens: number } {
  if (estimateTokens(full) <= budget) {
    return { text: full, tokens: estimateTokens(full) };
  }
  const boundaryBlock = boundaries.length
    ? `Hard boundaries (never violate):\n${boundaries
        .map((b) => `- ${b}`)
        .join("\n")}`
    : "Hard boundaries: none listed beyond product disclosure.";
  const boundaryTokens = estimateTokens(boundaryBlock);
  if (boundaryTokens >= budget) {
    // Extreme: keep as much of boundaries as possible (disclosure lives in stable block).
    const text = truncateKeepingPrefix(boundaryBlock, budget);
    return { text, tokens: estimateTokens(text) };
  }
  const relBudget = budget - boundaryTokens - 1;
  const relLine = full.split("\n")[0] ?? "Relationship: neutral.";
  const rel = clampTextToBudget(relLine, Math.max(1, relBudget));
  const text = `${rel.text}\n${boundaryBlock}`;
  return { text, tokens: estimateTokens(text) };
}

function truncateKeepingPrefix(text: string, budgetTokens: number): string {
  if (estimateTokens(text) <= budgetTokens) return text;
  const maxChars = Math.max(1, budgetTokens * 4);
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function wrapSource(input: {
  id: string;
  kind: string;
  text: string;
  time?: string;
  speaker?: string;
}): string {
  const attrs = [
    `id="${input.id}"`,
    `kind="${input.kind}"`,
    input.time ? `time="${input.time}"` : null,
    input.speaker ? `speaker="${input.speaker}"` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return `<source ${attrs}>\n${input.text}\n</source>`;
}
