"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "../../../components/EmptyState";
import {
  apiFetch,
  type PersonaListItem,
  type PlanResponse,
} from "../../../lib/api";

export default function DashboardPage() {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [personas, setPersonas] = useState<PersonaListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [p, list] = await Promise.all([
      apiFetch<PlanResponse>("/me/plan"),
      apiFetch<{ data: PersonaListItem[] }>("/personas"),
    ]);
    setPlan(p);
    setPersonas(list.data);
  }, []);

  useEffect(() => {
    reload().catch((err) => setError((err as Error).message));
  }, [reload]);

  async function onRestore(personaId: string) {
    setRestoringId(personaId);
    setError(null);
    try {
      await apiFetch(`/personas/${personaId}/restore`, { method: "POST" });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-[var(--muted)]">
            Personas you own or were invited to. Create one to start feeding
            records.
          </p>
        </div>
        {plan?.canCreatePersona ? (
          <Link
            href="/personas/new"
            className="rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white"
          >
            Create persona
          </Link>
        ) : (
          <span
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--muted)]"
            title="Soft-deleted personas still count until purge. Restore one below, or upgrade."
          >
            At plan cap — restore a deleted persona or upgrade
          </span>
        )}
      </div>

      {plan ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm">
          <span className="font-medium">{plan.displayName}</span>
          <span className="text-[var(--muted)]">
            {" "}
            · {plan.ownedPersonaCount}/{plan.maxOwnedPersonas} personas · chat
            memory {plan.maxChatMemoryMessages} ·{" "}
            {plan.maxChatMessagesPerDay == null
              ? "unlimited sends/day"
              : `${plan.maxChatMessagesPerDay} sends/day`}
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {personas.length === 0 ? (
        <EmptyState
          title="No personas yet"
          description="Create your first persona to appear on the dashboard and in Chat."
          action={
            plan?.canCreatePersona ? (
              <Link
                href="/personas/new"
                className="inline-block text-sm font-medium text-[var(--accent)]"
              >
                Open create wizard →
              </Link>
            ) : null
          }
        />
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          {personas.map((p) => {
            const deleted = Boolean(p.deletedAt);
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-[var(--background)]/60"
              >
                <div className="min-w-0 flex-1">
                  {deleted ? (
                    <>
                      <p className="font-medium text-[var(--muted)] line-through">
                        {p.displayName}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        Soft-deleted · still counts toward your plan until
                        purged · restore to chat again
                      </p>
                    </>
                  ) : (
                    <Link href={`/personas/${p.id}`} className="block min-w-0">
                      <p className="font-medium">{p.displayName}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {p.scenario} · {p.status} · {p.role}
                        {p.chatEligible ? " · chat ready" : " · needs consent"}
                      </p>
                    </Link>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-sm">
                  {deleted ? (
                    <button
                      type="button"
                      disabled={restoringId === p.id}
                      onClick={() => void onRestore(p.id)}
                      className="rounded-md bg-[var(--accent)] px-3 py-1.5 font-medium text-white disabled:opacity-60"
                    >
                      {restoringId === p.id ? "Restoring…" : "Restore"}
                    </button>
                  ) : (
                    <>
                      <Link
                        href={`/chat?persona=${encodeURIComponent(p.id)}`}
                        className="text-[var(--muted)] hover:text-[var(--accent)]"
                      >
                        Chat
                      </Link>
                      <Link
                        href={`/personas/${p.id}`}
                        className="text-[var(--accent)]"
                      >
                        Open
                      </Link>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
