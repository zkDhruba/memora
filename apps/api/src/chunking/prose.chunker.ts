import { estimateTokens, type DraftChunk } from "./chunk-types";

export const PROSE_TARGET_MIN = 800;
export const PROSE_TARGET_MAX = 1200;
export const PROSE_OVERLAP = 100;
export const OWNER_NOTE_WHOLE_MAX = 2000;

/**
 * PDF/DOCX/markdown/plain prose: paragraph windows 800–1,200 chars,
 * 100-character overlap.
 */
export function chunkProse(
  text: string,
  opts?: { sourceKind?: "prose" | "owner_note"; pageHint?: number | null },
): DraftChunk[] {
  const kind = opts?.sourceKind ?? "prose";
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];

  if (kind === "owner_note" && normalized.length <= OWNER_NOTE_WHOLE_MAX) {
    const header = "owner_note";
    return [
      {
        sourceKind: "owner_note",
        header,
        content: normalized,
        speakerRole: "document",
        retrievalAllowed: true,
        timeStart: null,
        timeEnd: null,
        messageStart: null,
        messageEnd: null,
        tokenCount: estimateTokens(header + normalized),
      },
    ];
  }

  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  const windows: string[] = [];
  let buf = "";

  for (const p of paragraphs) {
    const next = buf ? `${buf}\n\n${p}` : p;
    if (buf && next.length > PROSE_TARGET_MAX) {
      windows.push(buf);
      // Overlap: keep tail of previous window.
      const overlap = buf.slice(Math.max(0, buf.length - PROSE_OVERLAP));
      buf = overlap ? `${overlap}\n\n${p}` : p;
      if (buf.length > PROSE_TARGET_MAX) {
        // Paragraph alone oversized — emit as its own window.
        windows.push(p);
        buf = "";
      }
    } else if (!buf && p.length > PROSE_TARGET_MAX) {
      windows.push(p);
      buf = "";
    } else {
      buf = next;
    }
  }
  if (buf.trim()) windows.push(buf);

  // Merge a trailing undersized window into the previous when possible.
  const merged: string[] = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (
      last &&
      w.length < PROSE_TARGET_MIN &&
      last.length + w.length + 2 <= PROSE_TARGET_MAX
    ) {
      merged[merged.length - 1] = `${last}\n\n${w}`;
    } else {
      merged.push(w);
    }
  }

  const page =
    opts?.pageHint != null ? ` page=${opts.pageHint}` : "";

  return merged.map((content) => {
    const header = `prose${page}`;
    return {
      sourceKind: kind === "owner_note" ? "owner_note" : "prose",
      header,
      content,
      speakerRole: "document" as const,
      retrievalAllowed: true,
      timeStart: null,
      timeEnd: null,
      messageStart: null,
      messageEnd: null,
      tokenCount: estimateTokens(header + content),
    };
  });
}
