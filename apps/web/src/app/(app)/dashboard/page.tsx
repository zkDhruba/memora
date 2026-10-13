"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  apiFetch,
  type PersonaListItem,
  type PlanResponse,
} from "../../../lib/api";

export default function DashboardPage() {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [personas, setPersonas] = useState<PersonaListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<PlanResponse>("/me/plan"),
      apiFetch<{ data: PersonaListItem[] }>("/personas"),
    ])
      .then(([p, list]) => {
        setPlan(p);
        setPersonas(list.data);
      })
      .catch((err) => setError((err as Error).message));
  }, []);

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
            title="Upgrade or delete a persona after purge to free a slot"
          >
            At plan cap — upgrade to create more
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

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      {personas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
          <p className="font-medium">No personas yet</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Create your first persona to appear on the dashboard and in Chat.
          </p>
          {plan?.canCreatePersona ? (
            <Link
              href="/personas/new"
              className="mt-4 inline-block text-sm font-medium text-[var(--accent)]"
            >
              Open create wizard →
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          {personas.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-[var(--background)]/60"
            >
              <Link href={`/personas/${p.id}`} className="min-w-0 flex-1">
                <p className="font-medium">{p.displayName}</p>
                <p className="text-xs text-[var(--muted)]">
                  {p.scenario} · {p.status} · {p.role}
                  {p.chatEligible ? " · chat ready" : " · needs consent"}
                </p>
              </Link>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                <Link
                  href={`/chat?persona=${encodeURIComponent(p.id)}`}
                  className="text-[var(--muted)] hover:text-[var(--accent)]"
                >
                  Chat
                </Link>
                <Link href={`/personas/${p.id}`} className="text-[var(--accent)]">
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
