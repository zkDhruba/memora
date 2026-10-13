"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { apiFetch, type PersonaDetail } from "../../../../lib/api";

const STATEMENT_VERSION = "2026-10-consent-v1";

export default function NewPersonaPage() {
  const router = useRouter();
  const [scenario, setScenario] = useState<"living" | "legacy">("living");
  const [displayName, setDisplayName] = useState("");
  const [languages, setLanguages] = useState("en");
  const [biography, setBiography] = useState("");
  const [attestationStatement, setAttestationStatement] = useState("");
  const [consentHost, setConsentHost] = useState(true);
  const [consentConverse, setConsentConverse] = useState(true);
  const [consentProvider, setConsentProvider] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const consents = [];
    if (consentHost) {
      consents.push({
        purpose: "host_records" as const,
        statementVersion: STATEMENT_VERSION,
      });
    }
    if (consentConverse) {
      consents.push({
        purpose: "converse" as const,
        statementVersion: STATEMENT_VERSION,
      });
    }
    if (consentProvider) {
      consents.push({
        purpose: "send_to_provider" as const,
        providerKey: "anthropic",
        statementVersion: STATEMENT_VERSION,
      });
    }

    try {
      const persona = await apiFetch<PersonaDetail>("/personas", {
        method: "POST",
        body: JSON.stringify({
          scenario,
          displayName,
          languages: languages
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          biography: biography || undefined,
          attestation: {
            kind: scenario === "living" ? "self" : "representative",
            statement: attestationStatement,
          },
          consents,
          providerKey: consentProvider ? "anthropic" : undefined,
        }),
      });
      // No publish step — land in Chat hub with the new persona selected.
      router.push(`/chat?persona=${encodeURIComponent(persona.id)}`);
    } catch (err) {
      const e = err as { message: string; code?: string; details?: Record<string, unknown> };
      if (e.code === "PLAN_LIMIT_PERSONAS") {
        setError(
          `Plan limit reached (${String(e.details?.currentOwned)}/${String(e.details?.maxOwnedPersonas)}). Upgrade to create more.`,
        );
      } else {
        setError(e.message);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <Link href="/dashboard" className="text-sm text-[var(--muted)]">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Create persona
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Attestation and consent are required. After create you go straight to
          Chat — there is no publish step (send still needs converse consent).
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <fieldset className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scenario"
              checked={scenario === "living"}
              onChange={() => setScenario("living")}
            />
            Living (self)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scenario"
              checked={scenario === "legacy"}
              onChange={() => setScenario("legacy")}
            />
            Legacy (representative)
          </label>
        </fieldset>

        <label className="flex flex-col gap-1 text-sm">
          Display name
          <input
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Languages (comma-separated)
          <input
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            required
            value={languages}
            onChange={(e) => setLanguages(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Biography (optional)
          <textarea
            className="min-h-24 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            value={biography}
            onChange={(e) => setBiography(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {scenario === "living"
            ? "Self attestation"
            : "Representative attestation"}
          <textarea
            className="min-h-24 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            required
            minLength={10}
            placeholder={
              scenario === "living"
                ? "I confirm I am the subject of this persona…"
                : "I confirm I am authorized to create a legacy persona…"
            }
            value={attestationStatement}
            onChange={(e) => setAttestationStatement(e.target.value)}
          />
        </label>

        <fieldset className="flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
          <legend className="px-1 font-medium">Consents</legend>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={consentHost}
              onChange={(e) => setConsentHost(e.target.checked)}
            />
            Host records on Memora
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={consentConverse}
              onChange={(e) => setConsentConverse(e.target.checked)}
            />
            Allow text conversation with the simulation
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={consentProvider}
              onChange={(e) => setConsentProvider(e.target.checked)}
            />
            Send extracts to the AI provider (Anthropic)
          </label>
          <p className="text-xs text-[var(--muted)]">
            Without host + converse consent the persona stays <em>draft</em>.
          </p>
        </fieldset>

        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create persona"}
        </button>
      </form>
    </div>
  );
}
