import { PLAN_IDS } from "@memora/shared";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm tracking-wide text-[var(--muted)] uppercase">Memora</p>
      <h1 className="text-4xl leading-tight font-normal text-[var(--foreground)] md:text-5xl">
        A disclosed AI simulation built from records you provide.
      </h1>
      <p className="text-lg text-[var(--muted)]">
        Version 1 is text conversation. This page is the Phase 1.1 monorepo scaffold —
        auth and studio screens come next.
      </p>
      <p className="text-sm text-[var(--muted)]">
        Plan catalog wired from <code className="text-[var(--accent)]">@memora/shared</code>:{" "}
        {PLAN_IDS.join(", ")}.
      </p>
    </main>
  );
}
