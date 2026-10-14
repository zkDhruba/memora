import type { Response } from "express";

export type SseWriter = {
  send: (event: string, data: unknown) => void;
  comment: (text: string) => void;
  end: () => void;
};

export function createSseWriter(res: Response): SseWriter {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  return {
    send(event, data) {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    comment(text) {
      if (res.writableEnded) return;
      res.write(`: ${text}\n\n`);
    },
    end() {
      if (!res.writableEnded) res.end();
    },
  };
}
