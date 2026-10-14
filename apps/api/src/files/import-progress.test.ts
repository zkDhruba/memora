import { describe, expect, it } from "vitest";
import {
  fileProgressPercent,
  isFileTerminal,
  jobProgressPercent,
} from "./import-progress";

describe("import progress helpers (2.9)", () => {
  it("marks parsed / needs_attention / infected / deleted as terminal", () => {
    expect(isFileTerminal("parsed")).toBe(true);
    expect(isFileTerminal("needs_attention")).toBe(true);
    expect(isFileTerminal("infected")).toBe(true);
    expect(isFileTerminal("deleted")).toBe(true);
    expect(isFileTerminal("deleting")).toBe(false);
    expect(isFileTerminal("clean")).toBe(false);
    expect(isFileTerminal("clean", { jobStatus: "completed" })).toBe(true);
    expect(isFileTerminal("pending_upload")).toBe(false);
  });

  it("derives file percent from status and job", () => {
    expect(fileProgressPercent({ fileStatus: "pending_upload" })).toBe(0);
    expect(fileProgressPercent({ fileStatus: "uploaded" })).toBe(20);
    expect(
      fileProgressPercent({ fileStatus: "clean", jobStatus: "pending" }),
    ).toBe(40);
    expect(
      fileProgressPercent({ fileStatus: "clean", jobStatus: "active" }),
    ).toBe(65);
    expect(fileProgressPercent({ fileStatus: "deleting" })).toBe(90);
    expect(fileProgressPercent({ fileStatus: "parsed" })).toBe(100);
  });

  it("derives job percent", () => {
    expect(jobProgressPercent("pending")).toBe(15);
    expect(jobProgressPercent("active")).toBe(60);
    expect(jobProgressPercent("completed")).toBe(100);
    expect(jobProgressPercent("dead")).toBe(100);
  });
});
