import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { DocumentParseError } from "./parse-result";

/** iOS / bracketed: [DD/MM/YYYY, HH:MM:SS] Name: text */
const BRACKETED =
  /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\]\s*([^:]+?):\s*(.*)$/;

/** Android dash: DD/MM/YYYY, HH:MM - Name: text */
const DASHED =
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\s+-\s+([^:]+?):\s*(.*)$/;

const SYSTEM_BODY =
  /^(messages and calls are end-to-end encrypted|.*(?:media|image|video|audio|sticker|gif|document) omitted|<attached:|<media omitted>)/i;

export type WhatsAppDateStyle = "bracketed" | "dashed" | "mixed" | "none";

export type ParsedWhatsAppMessage = {
  kind: "speech" | "system";
  rawLabel: string | null;
  sentAt: Date | null;
  body: string;
  bodyHash: string;
  position: number;
};

export type ParsedWhatsAppChat = {
  dateStyle: WhatsAppDateStyle;
  title: string | null;
  participants: string[];
  messages: ParsedWhatsAppMessage[];
  anomalies: string[];
  speechCount: number;
};

function bodyHash(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function parseClock(time: string): {
  h: number;
  m: number;
  s: number;
} | null {
  const ampm = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])?$/);
  if (!ampm) return null;
  let h = Number(ampm[1]);
  const m = Number(ampm[2]);
  const s = Number(ampm[3] ?? "0");
  const mer = ampm[4]?.toLowerCase();
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  return { h, m, s };
}

/** Prefer D/M/Y (WhatsApp international). If first > 12, that side is day. */
function parseDateParts(date: string): { y: number; mo: number; d: number } | null {
  const parts = date.split("/").map((p) => Number(p));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  let [a, b, y] = parts as [number, number, number];
  if (y < 100) y += 2000;
  let d: number;
  let mo: number;
  if (a > 12) {
    d = a;
    mo = b;
  } else if (b > 12) {
    mo = a;
    d = b;
  } else {
    // Ambiguous — assume D/M/Y (common WhatsApp export).
    d = a;
    mo = b;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, mo, d };
}

function toSentAt(date: string, time: string): Date | null {
  const dp = parseDateParts(date);
  const tp = parseClock(time.trim());
  if (!dp || !tp) return null;
  return new Date(Date.UTC(dp.y, dp.mo - 1, dp.d, tp.h, tp.m, tp.s));
}

function matchLine(
  line: string,
): {
  style: "bracketed" | "dashed";
  date: string;
  time: string;
  name: string;
  body: string;
} | null {
  const b = line.match(BRACKETED);
  if (b) {
    return {
      style: "bracketed",
      date: b[1]!,
      time: b[2]!,
      name: b[3]!.trim(),
      body: b[4] ?? "",
    };
  }
  const d = line.match(DASHED);
  if (d) {
    return {
      style: "dashed",
      date: d[1]!,
      time: d[2]!,
      name: d[3]!.trim(),
      body: d[4] ?? "",
    };
  }
  return null;
}

export function looksLikeWhatsApp(filename: string, text: string): boolean {
  const lower = filename.toLowerCase();
  if (lower === "_chat.txt" || lower.includes("whatsapp")) return true;
  const lines = text.split(/\r?\n/).slice(0, 80);
  let hits = 0;
  for (const line of lines) {
    if (matchLine(line.trim())) hits += 1;
    if (hits >= 2) return true;
  }
  return false;
}

@Injectable()
export class WhatsAppParser {
  parse(text: string, opts?: { filename?: string }): ParsedWhatsAppChat {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
    const messages: ParsedWhatsAppMessage[] = [];
    const anomalies: string[] = [];
    const labels = new Set<string>();
    let styles = new Set<"bracketed" | "dashed">();
    let position = 0;
    let current: ParsedWhatsAppMessage | null = null;

    const flush = () => {
      if (!current) return;
      current.bodyHash = bodyHash(current.body);
      messages.push(current);
      current = null;
    };

    for (const raw of lines) {
      const line = raw;
      if (line.trim().length === 0) {
        if (current) current.body += "\n";
        continue;
      }

      const hit = matchLine(line);
      if (hit) {
        flush();
        styles.add(hit.style);
        const sentAt = toSentAt(hit.date, hit.time);
        const isSystem =
          SYSTEM_BODY.test(hit.body) ||
          hit.name.toLowerCase() === "system";

        if (isSystem) {
          current = {
            kind: "system",
            rawLabel: null,
            sentAt,
            body: hit.body,
            bodyHash: "",
            position: position++,
          };
        } else {
          labels.add(hit.name);
          current = {
            kind: "speech",
            rawLabel: hit.name,
            sentAt,
            body: hit.body,
            bodyHash: "",
            position: position++,
          };
        }
        continue;
      }

      // Continuation of previous message body.
      if (current) {
        current.body = current.body.length
          ? `${current.body}\n${line}`
          : line;
        continue;
      }

      anomalies.push(line.slice(0, 500));
    }
    flush();

    const speechCount = messages.filter((m) => m.kind === "speech").length;
    if (speechCount === 0) {
      throw new DocumentParseError(
        "No WhatsApp messages parsed",
        "EMPTY",
        { anomalies: anomalies.slice(0, 20) },
      );
    }

    let dateStyle: WhatsAppDateStyle = "none";
    if (styles.size === 1) dateStyle = [...styles][0]!;
    else if (styles.size > 1) dateStyle = "mixed";

    const title =
      opts?.filename && opts.filename !== "_chat.txt"
        ? opts.filename.replace(/\.txt$/i, "")
        : null;

    return {
      dateStyle,
      title,
      participants: [...labels].sort(),
      messages,
      anomalies: anomalies.slice(0, 100),
      speechCount,
    };
  }
}
