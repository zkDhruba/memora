"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { DisclosureBanner } from "../../../components/DisclosureBanner";
import {
  apiFetch,
  type PersonaListItem,
  type PlanResponse,
} from "../../../lib/api";

function ChatHubInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("persona");

  const [personas, setPersonas] = useState<PersonaListItem[]>([]);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<{ data: PersonaListItem[] }>("/personas?for=chat"),
      apiFetch<PlanResponse>("/me/plan"),
    ])
      .then(([list, p]) => {
        if (cancelled) return;
        setPersonas(list.data);
        setPlan(p);
        // If URL has an unknown/stale id, clear it.
        if (
          selectedId &&
          !list.data.some((persona) => persona.id === selectedId)
        ) {
          router.replace("/chat");
        }
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router, selectedId]);

  const selected = useMemo(
    () => personas.find((p) => p.id === selectedId) ?? null,
    [personas, selectedId],
  );

  function selectPersona(id: string) {
    router.replace(`/chat?persona=${encodeURIComponent(id)}`);
  }

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Loading chat hub…</p>;
  }

  if (error) {
    return <p className="text-sm text-[var(--danger)]">{error}</p>;
  }

  if (personas.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-semibold tracking-tight">Chat</h1>
        <DisclosureBanner />
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
          <p className="font-medium">No personas in Chat yet</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Create a persona on the dashboard. It appears here automatically —
            there is no separate publish step.
          </p>
          {plan?.canCreatePersona ? (
            <Link
              href="/personas/new"
              className="mt-4 inline-block text-sm font-medium text-[var(--accent)]"
            >
              Create persona →
            </Link>
          ) : (
            <p className="mt-4 text-sm text-[var(--muted)]">
              You are at your plan cap. Upgrade or wait until a purged persona
              frees a slot.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Chat</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Switch personas below. New personas show up here as soon as they are
          created.
        </p>
      </div>

      <DisclosureBanner />

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <p className="border-b border-[var(--border)] px-3 py-2 text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
            Personas
          </p>
          <ul className="max-h-[420px] overflow-auto py-1">
            {personas.map((p) => {
              const active = p.id === selected?.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => selectPersona(p.id)}
                    className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm transition ${
                      active
                        ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "hover:bg-[var(--background)]"
                    }`}
                  >
                    <span className="font-medium">{p.displayName}</span>
                    <span className="text-xs text-[var(--muted)]">
                      {p.status}
                      {p.chatEligible ? "" : " · needs converse consent"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="flex min-h-[360px] flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          {selected ? (
            <>
              <header className="border-b border-[var(--border)] px-4 py-3">
                <p className="font-medium">{selected.displayName}</p>
                <p className="text-xs text-[var(--muted)]">
                  {selected.scenario} · {selected.status} · your role:{" "}
                  {selected.role}
                </p>
              </header>

              <div className="flex flex-1 flex-col justify-center gap-3 px-4 py-8 text-sm">
                {!selected.chatEligible ? (
                  <p className="text-[var(--warn)]">
                    Conversations stay limited until{" "}
                    <strong>converse</strong> consent is granted on the persona.
                    You can still open this panel — sending unlocks after
                    consent.
                  </p>
                ) : (
                  <p className="text-[var(--muted)]">
                    This record may still be thin until you upload and review
                    sources (Phase 2–3). Suggested starter: ask what is in the
                    biography — never invent missing life facts.
                  </p>
                )}
                <p className="text-[var(--muted)]">
                  Streaming replies ship in Phase 3. The picker and disclosure
                  are live now so create → Chat works without a publish step.
                </p>
                <Link
                  href={`/personas/${selected.id}`}
                  className="text-[var(--accent)]"
                >
                  Open persona overview →
                </Link>
              </div>

              <footer className="border-t border-[var(--border)] px-4 py-3">
                <div className="flex gap-2">
                  <input
                    disabled
                    placeholder="Message composer unlocks with streaming chat (Phase 3)"
                    className="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--muted)]"
                  />
                  <button
                    type="button"
                    disabled
                    className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white opacity-50"
                  >
                    Send
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-4 text-sm text-[var(--muted)]">
              Select a persona to open a conversation panel.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function ChatHubPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-[var(--muted)]">Loading chat hub…</p>}
    >
      <ChatHubInner />
    </Suspense>
  );
}
