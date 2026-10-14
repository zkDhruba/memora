"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  apiFetch,
  type ReviewMemoryItem,
  type ReviewQueue,
  type ReviewTraitItem,
} from "../../../../../lib/api";

export default function ReviewInboxPage() {
  const { id } = useParams<{ id: string }>();
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [correctDrafts, setCorrectDrafts] = useState<Record<string, string>>(
    {},
  );
  const [showCorrect, setShowCorrect] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    apiFetch<ReviewQueue>(`/personas/${id}/review-queue`)
      .then(setQueue)
      .catch((err) => setError((err as Error).message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function decideTrait(
    traitId: string,
    action: "confirm" | "reject" | "correct",
  ) {
    setBusyId(traitId);
    setError(null);
    setMessage(null);
    try {
      const body: { action: string; value?: string } = { action };
      if (action === "correct") {
        const value = correctDrafts[traitId]?.trim();
        if (!value) {
          setError("Enter a corrected value.");
          return;
        }
        body.value = value;
      }
      await apiFetch(`/personas/${id}/traits/${traitId}/decision`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setMessage(
        action === "confirm"
          ? "Trait confirmed — now retrieval-eligible."
          : action === "reject"
            ? "Trait rejected."
            : "Trait corrected and confirmed.",
      );
      setShowCorrect((s) => ({ ...s, [traitId]: false }));
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function decideMemory(
    memoryId: string,
    action: "confirm" | "reject",
  ) {
    setBusyId(memoryId);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/personas/${id}/memories/${memoryId}/decision`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setMessage(
        action === "confirm"
          ? "Memory confirmed — now retrieval-eligible."
          : "Memory rejected.",
      );
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function correctMemory(e: FormEvent, memoryId: string) {
    e.preventDefault();
    const text = correctDrafts[memoryId]?.trim();
    if (!text) {
      setError("Enter corrected memory text.");
      return;
    }
    setBusyId(memoryId);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/personas/${id}/memories/${memoryId}/correct`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setMessage("Memory corrected — new confirmed row supersedes the old one.");
      setShowCorrect((s) => ({ ...s, [memoryId]: false }));
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (!queue && !error) {
    return <p className="text-sm text-[var(--muted)]">Loading review queue…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/personas/${id}`}
          className="text-sm text-[var(--muted)]"
        >
          ← Persona
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Review inbox
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Confirm makes items retrieval-eligible. Reject keeps them for audit
          only. Correct replaces the text and confirms.
        </p>
        {queue ? (
          <p className="mt-1 text-sm text-[var(--muted)]">
            {queue.pendingCount} pending
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-[var(--danger)]">{error}</p>
      ) : null}
      {message ? (
        <p className="text-sm text-[var(--foreground)]">{message}</p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Traits</h2>
        {!queue?.traits.length ? (
          <p className="text-sm text-[var(--muted)]">No pending traits.</p>
        ) : (
          queue.traits.map((t) => (
            <TraitCard
              key={t.id}
              trait={t}
              busy={busyId === t.id}
              showCorrect={!!showCorrect[t.id]}
              draft={correctDrafts[t.id] ?? t.value}
              onDraft={(v) =>
                setCorrectDrafts((d) => ({ ...d, [t.id]: v }))
              }
              onToggleCorrect={() =>
                setShowCorrect((s) => ({ ...s, [t.id]: !s[t.id] }))
              }
              onConfirm={() => void decideTrait(t.id, "confirm")}
              onReject={() => void decideTrait(t.id, "reject")}
              onCorrect={() => void decideTrait(t.id, "correct")}
            />
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Memories</h2>
        {!queue?.memories.length ? (
          <p className="text-sm text-[var(--muted)]">No pending memories.</p>
        ) : (
          queue.memories.map((m) => (
            <MemoryCard
              key={m.id}
              memory={m}
              busy={busyId === m.id}
              showCorrect={!!showCorrect[m.id]}
              draft={correctDrafts[m.id] ?? m.text}
              onDraft={(v) =>
                setCorrectDrafts((d) => ({ ...d, [m.id]: v }))
              }
              onToggleCorrect={() =>
                setShowCorrect((s) => ({ ...s, [m.id]: !s[m.id] }))
              }
              onConfirm={() => void decideMemory(m.id, "confirm")}
              onReject={() => void decideMemory(m.id, "reject")}
              onCorrect={(e) => void correctMemory(e, m.id)}
            />
          ))
        )}
      </section>
    </div>
  );
}

function TraitCard(props: {
  trait: ReviewTraitItem;
  busy: boolean;
  showCorrect: boolean;
  draft: string;
  onDraft: (v: string) => void;
  onToggleCorrect: () => void;
  onConfirm: () => void;
  onReject: () => void;
  onCorrect: () => void;
}) {
  const { trait } = props;
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
      <p className="font-medium">
        {trait.facet}{" "}
        <span className="font-normal text-[var(--muted)]">
          · class {trait.knowledgeClass} · conf {trait.confidence.toFixed(2)}
        </span>
      </p>
      <p className="mt-1">{trait.value}</p>
      {trait.evidence.length > 0 ? (
        <ul className="mt-2 list-inside list-disc text-[var(--muted)]">
          {trait.evidence.map((e) => (
            <li key={e.id}>“{e.quote}”</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={props.busy}
          onClick={props.onConfirm}
          className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--background)] disabled:opacity-50"
        >
          Confirm
        </button>
        <button
          type="button"
          disabled={props.busy}
          onClick={props.onReject}
          className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--background)] disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          disabled={props.busy}
          onClick={props.onToggleCorrect}
          className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--background)] disabled:opacity-50"
        >
          Correct
        </button>
      </div>
      {props.showCorrect ? (
        <div className="mt-3 flex flex-col gap-2">
          <input
            className="rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            value={props.draft}
            onChange={(e) => props.onDraft(e.target.value)}
          />
          <button
            type="button"
            disabled={props.busy}
            onClick={props.onCorrect}
            className="w-fit rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--background)] disabled:opacity-50"
          >
            Save correction
          </button>
        </div>
      ) : null}
    </article>
  );
}

function MemoryCard(props: {
  memory: ReviewMemoryItem;
  busy: boolean;
  showCorrect: boolean;
  draft: string;
  onDraft: (v: string) => void;
  onToggleCorrect: () => void;
  onConfirm: () => void;
  onReject: () => void;
  onCorrect: (e: FormEvent) => void;
}) {
  const { memory } = props;
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
      <p className="font-medium">
        {memory.memoryType}{" "}
        <span className="font-normal text-[var(--muted)]">
          · class {memory.knowledgeClass} · conf {memory.confidence.toFixed(2)}
        </span>
      </p>
      <p className="mt-1">{memory.text}</p>
      {memory.evidence.length > 0 ? (
        <ul className="mt-2 list-inside list-disc text-[var(--muted)]">
          {memory.evidence.map((e) => (
            <li key={e.id}>“{e.quote}”</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={props.busy}
          onClick={props.onConfirm}
          className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--background)] disabled:opacity-50"
        >
          Confirm
        </button>
        <button
          type="button"
          disabled={props.busy}
          onClick={props.onReject}
          className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--background)] disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          disabled={props.busy}
          onClick={props.onToggleCorrect}
          className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--background)] disabled:opacity-50"
        >
          Correct
        </button>
      </div>
      {props.showCorrect ? (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={props.onCorrect}
        >
          <textarea
            className="min-h-[4rem] rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            value={props.draft}
            onChange={(e) => props.onDraft(e.target.value)}
          />
          <button
            type="submit"
            disabled={props.busy}
            className="w-fit rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--background)] disabled:opacity-50"
          >
            Save correction
          </button>
        </form>
      ) : null}
    </article>
  );
}
