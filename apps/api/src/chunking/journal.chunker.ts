import { estimateTokens, type DraftChunk } from "./chunk-types";

export const JOURNAL_TARGET_MIN = 500;
export const JOURNAL_TARGET_MAX = 1000;

const ISO_DATE =
  /\b(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?)\b/;

/**
 * Journal rule: split on blank lines. Keep entry date in the header.
 * Target 500–1,000 characters. Do not merge two dated entries.
 */
export function chunkJournal(text: string): DraftChunk[] {
  const entries = splitJournalEntries(text);
  const out: DraftChunk[] = [];

  for (const entry of entries) {
    const dateMatch = entry.match(ISO_DATE);
    const dateLabel = dateMatch?.[1] ?? "undated";
    const header = `journal date=${dateLabel}`;

    if (entry.length <= JOURNAL_TARGET_MAX) {
      out.push(makeJournalChunk(header, entry, dateLabel));
      continue;
    }

    // Oversized single entry: soft-split on paragraphs without merging next entry.
    const paras = entry.split(/\n+/).filter((p) => p.trim().length > 0);
    let buf = "";
    for (const p of paras) {
      const next = buf ? `${buf}\n${p}` : p;
      if (buf && next.length > JOURNAL_TARGET_MAX) {
        out.push(makeJournalChunk(header, buf, dateLabel));
        buf = p;
      } else {
        buf = next;
      }
    }
    if (buf.trim()) out.push(makeJournalChunk(header, buf, dateLabel));
  }

  return out;
}

/** Blank-line separated entries; dated lines always start a new entry. */
export function splitJournalEntries(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n\s*\n+/);
  const entries: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const hasDate = ISO_DATE.test(trimmed);
    const prev = entries[entries.length - 1];
    if (
      prev &&
      !hasDate &&
      prev.length < JOURNAL_TARGET_MIN &&
      !ISO_DATE.test(prev)
    ) {
      // Merge undated short block into previous undated block only.
      entries[entries.length - 1] = `${prev}\n\n${trimmed}`;
    } else {
      entries.push(trimmed);
    }
  }

  return entries;
}

function makeJournalChunk(
  header: string,
  content: string,
  dateLabel: string,
): DraftChunk {
  const time = dateLabel === "undated" ? null : parseLooseDate(dateLabel);
  return {
    sourceKind: "journal",
    header,
    content: content.trim(),
    speakerRole: "document",
    retrievalAllowed: true,
    timeStart: time,
    timeEnd: time,
    messageStart: null,
    messageEnd: null,
    tokenCount: estimateTokens(header + content),
  };
}

function parseLooseDate(label: string): Date | null {
  const d = new Date(label);
  return Number.isNaN(d.getTime()) ? null : d;
}
