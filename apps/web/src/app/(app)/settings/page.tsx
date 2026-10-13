"use client";

import { useEffect, useState } from "react";
import {
  apiFetch,
  type AuditLogItem,
  type MeResponse,
  type PlanResponse,
} from "../../../lib/api";

export default function SettingsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [audit, setAudit] = useState<AuditLogItem[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<MeResponse>("/me"),
      apiFetch<PlanResponse>("/me/plan"),
      apiFetch<{ data: AuditLogItem[] }>("/me/audit?limit=20"),
    ])
      .then(([m, p, a]) => {
        setMe(m);
        setPlan(p);
        setAudit(a.data);
      })
      .catch((err) => {
        setAuditError((err as Error).message);
      });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      {me ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
          <p>
            <span className="text-[var(--muted)]">Email:</span> {me.email}
          </p>
          <p>
            <span className="text-[var(--muted)]">Verified:</span>{" "}
            {me.emailVerified ? "yes" : "no"}
          </p>
          <p>
            <span className="text-[var(--muted)]">MFA:</span>{" "}
            {me.mfaEnabled ? "enabled" : "off"}
          </p>
        </div>
      ) : null}
      {plan ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
          <p className="font-medium">{plan.displayName} plan</p>
          <p className="mt-1 text-[var(--muted)]">
            Personas {plan.ownedPersonaCount}/{plan.maxOwnedPersonas} · memory{" "}
            {plan.maxChatMemoryMessages} · daily sends{" "}
            {plan.maxChatMessagesPerDay ?? "unlimited"} (
            {plan.chatMessagesUsedToday} used today)
          </p>
        </div>
      ) : null}

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <h2 className="font-medium">Recent activity</h2>
        <p className="mt-1 text-[var(--muted)]">
          Audit events for actions you performed (login, consent, plan changes).
        </p>
        {auditError ? (
          <p className="mt-3 text-[var(--danger)]">{auditError}</p>
        ) : audit.length === 0 ? (
          <p className="mt-3 text-[var(--muted)]">No events yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {audit.map((row) => (
              <li key={row.id} className="flex flex-col gap-0.5 py-2">
                <span className="font-medium">{row.action}</span>
                <span className="text-xs text-[var(--muted)]">
                  {new Date(row.createdAt).toLocaleString()}
                  {row.targetType ? ` · ${row.targetType}` : ""}
                  {row.personaId ? ` · persona ${row.personaId.slice(0, 8)}…` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
