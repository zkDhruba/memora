export function DisclosureBanner() {
  return (
    <aside
      role="note"
      aria-label="AI simulation disclosure"
      className="rounded-md border border-[var(--border)] bg-[var(--accent-soft)]/60 px-4 py-3 text-sm text-[var(--foreground)]"
    >
      <p className="font-medium">AI simulation disclosure</p>
      <p className="mt-1 text-[var(--muted)]">
        You are talking to an AI built from records you (or an authorized person)
        provided — not to the real person, and not a claim of presence or
        afterlife.
      </p>
    </aside>
  );
}
