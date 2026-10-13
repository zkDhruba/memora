"use client";

import { useEffect, useState } from "react";
import { apiFetch, type MeResponse, type PlanResponse } from "../../../lib/api";

export default function SettingsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [plan, setPlan] = useState<PlanResponse | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<MeResponse>("/me"),
      apiFetch<PlanResponse>("/me/plan"),
    ]).then(([m, p]) => {
      setMe(m);
      setPlan(p);
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
    </div>
  );
}
