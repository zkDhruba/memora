/** File statuses where the UI can stop waiting on the pipeline. */
export const FILE_TERMINAL_STATUSES = new Set([
  "parsed",
  "ready",
  "infected",
  "needs_attention",
  "deleted",
]);

export function isFileTerminal(
  status: string,
  opts?: { jobStatus?: string | null },
): boolean {
  if (FILE_TERMINAL_STATUSES.has(status)) return true;
  // Legacy: parse finished but file left `clean` (e.g. unsupported skip).
  if (
    status === "clean" &&
    (opts?.jobStatus === "completed" || opts?.jobStatus === "dead")
  ) {
    return true;
  }
  return false;
}

/** Derive a 0–100 progress value from file status + latest job. */
export function fileProgressPercent(input: {
  fileStatus: string;
  jobStatus?: string | null;
  jobStage?: string | null;
}): number {
  const { fileStatus, jobStatus } = input;
  if (
    fileStatus === "parsed" ||
    fileStatus === "ready" ||
    fileStatus === "infected" ||
    fileStatus === "needs_attention" ||
    fileStatus === "deleted"
  ) {
    return 100;
  }
  if (fileStatus === "deleting") return 90;
  if (fileStatus === "pending_upload") return 0;
  if (fileStatus === "uploaded") return 20;
  if (fileStatus === "clean") {
    // Completed parse that left the file `clean` (legacy skip) — treat as done.
    if (jobStatus === "completed" || jobStatus === "dead") return 100;
    if (jobStatus === "active") return 65;
    if (jobStatus === "pending") return 40;
    if (jobStatus === "failed") return 55;
    return 35;
  }
  return 10;
}

export function jobProgressPercent(status: string): number {
  switch (status) {
    case "pending":
      return 15;
    case "active":
      return 60;
    case "completed":
      return 100;
    case "failed":
      return 50;
    case "dead":
      return 100;
    default:
      return 0;
  }
}
