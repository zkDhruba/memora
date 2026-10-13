import Link from "next/link";

export default function ChatHubPlaceholder() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">Chat</h1>
      <p className="text-[var(--muted)]">
        You are talking to an AI simulation built from records — not the person.
        The persona switcher lands in Phase 1.8.
      </p>
      <Link href="/dashboard" className="text-sm text-[var(--accent)]">
        Manage personas on the dashboard →
      </Link>
    </div>
  );
}
