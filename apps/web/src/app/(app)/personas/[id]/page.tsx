"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  apiFetch,
  type PersonaDetail,
  type SourceFileListItem,
  type SourceParticipant,
} from "../../../../lib/api";

export default function PersonaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [persona, setPersona] = useState<PersonaDetail | null>(null);
  const [biography, setBiography] = useState("");
  const [files, setFiles] = useState<SourceFileListItem[]>([]);
  const [mappingFileId, setMappingFileId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<SourceParticipant[]>([]);
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const loadFiles = useCallback(() => {
    apiFetch<{ data: SourceFileListItem[] }>(`/personas/${id}/files`)
      .then((res) => setFiles(res.data))
      .catch(() => setFiles([]));
  }, [id]);

  const load = useCallback(() => {
    apiFetch<PersonaDetail>(`/personas/${id}`)
      .then((p) => {
        setPersona(p);
        setBiography(p.biography ?? "");
      })
      .catch((err) => setError((err as Error).message));
    loadFiles();
  }, [id, loadFiles]);

  useEffect(() => {
    load();
  }, [load]);

  async function openMapping(fileId: string) {
    setError(null);
    setMessage(null);
    setMappingFileId(fileId);
    setSelectedParticipantId("");
    try {
      const res = await apiFetch<{
        data: SourceParticipant[];
        needsSubjectMapping: boolean;
      }>(`/personas/${id}/files/${fileId}/participants`);
      setParticipants(res.data);
      const unknown = res.data.find((p) => p.role === "unknown");
      setSelectedParticipantId(unknown?.id ?? res.data[0]?.id ?? "");
    } catch (err) {
      setError((err as Error).message);
      setMappingFileId(null);
    }
  }

  async function onMapSubject(e: FormEvent) {
    e.preventDefault();
    if (!mappingFileId || !selectedParticipantId) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiFetch<{ subjectLabel: string; status: string }>(
        `/personas/${id}/files/${mappingFileId}/subject-mapping`,
        {
          method: "POST",
          body: JSON.stringify({ participantId: selectedParticipantId }),
        },
      );
      setMessage(`Mapped subject: ${res.subjectLabel}`);
      setMappingFileId(null);
      setParticipants([]);
      loadFiles();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await apiFetch<PersonaDetail>(`/personas/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ biography }),
      });
      setPersona(updated);
      setMessage("Saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function onDelete() {
    if (!confirm("Soft-delete this persona? It still counts toward your plan until purge.")) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/personas/${id}`, { method: "DELETE" });
      router.push("/dashboard");
    } catch (err) {
      const e = err as { message: string; code?: string };
      if (e.code === "MFA_STEP_UP_REQUIRED") {
        setError("MFA step-up required. Confirm MFA in Settings, then try again.");
      } else {
        setError(e.message);
      }
    } finally {
      setPending(false);
    }
  }

  if (!persona && !error) {
    return <p className="text-sm text-[var(--muted)]">Loading persona…</p>;
  }

  if (!persona) {
    return <p className="text-sm text-[var(--danger)]">{error}</p>;
  }

  const needsMapping = files.filter((f) => f.needsSubjectMapping);
  const canMap =
    persona.role === "owner" || persona.role === "manager";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard" className="text-sm text-[var(--muted)]">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {persona.displayName}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          {persona.scenario} · {persona.status} · {persona.role}
          {persona.chatEligible ? " · chat eligible" : " · not chat eligible yet"}
        </p>
      </div>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <h2 className="font-medium">Attestation</h2>
        {persona.attestation ? (
          <p className="mt-2 text-[var(--muted)]">
            <span className="font-medium text-[var(--foreground)]">
              {persona.attestation.kind}
            </span>
            : {persona.attestation.statement}
          </p>
        ) : (
          <p className="mt-2 text-[var(--muted)]">None</p>
        )}
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <h2 className="font-medium">Active consents</h2>
        {persona.consents.length === 0 ? (
          <p className="mt-2 text-[var(--muted)]">
            Draft until host_records and converse are granted.
          </p>
        ) : (
          <ul className="mt-2 list-inside list-disc text-[var(--muted)]">
            {persona.consents.map((c) => (
              <li key={c.id}>
                {c.purpose}
                {c.providerKey ? ` (${c.providerKey})` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <h2 className="font-medium">Source files</h2>
        {files.length === 0 ? (
          <p className="mt-2 text-[var(--muted)]">
            No uploads yet. Use the API upload flow until the import UI lands
            (2.9).
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2 last:border-0"
              >
                <div>
                  <p className="font-medium text-[var(--foreground)]">
                    {f.originalFilename}
                  </p>
                  <p className="text-[var(--muted)]">
                    {f.status}
                    {f.participantCount > 0
                      ? ` · ${f.participantCount} participants`
                      : ""}
                    {f.needsSubjectMapping ? " · needs subject mapping" : ""}
                  </p>
                </div>
                {f.needsSubjectMapping && canMap ? (
                  <button
                    type="button"
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
                    onClick={() => void openMapping(f.id)}
                  >
                    Map subject
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {needsMapping.length > 0 && !canMap ? (
          <p className="mt-2 text-[var(--muted)]">
            Subject mapping requires owner or manager.
          </p>
        ) : null}

        {mappingFileId ? (
          <form onSubmit={onMapSubject} className="mt-4 flex flex-col gap-3">
            <p className="font-medium">Which name is the persona subject?</p>
            <div className="flex flex-col gap-2">
              {participants.map((p) => (
                <label key={p.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="subject"
                    value={p.id}
                    checked={selectedParticipantId === p.id}
                    onChange={() => setSelectedParticipantId(p.id)}
                  />
                  <span>
                    {p.rawLabel}{" "}
                    <span className="text-[var(--muted)]">({p.role})</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pending || !selectedParticipantId}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                Save mapping
              </button>
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm"
                onClick={() => {
                  setMappingFileId(null);
                  setParticipants([]);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <form onSubmit={onSave} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Biography
          <textarea
            className="min-h-32 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            value={biography}
            onChange={(e) => setBiography(e.target.value)}
          />
        </label>
        {message ? <p className="text-sm text-[var(--accent)]">{message}</p> : null}
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Save
          </button>
          <Link
            href={`/chat?persona=${encodeURIComponent(persona.id)}`}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium"
          >
            Open in Chat
          </Link>
          {persona.role === "owner" ? (
            <button
              type="button"
              disabled={pending}
              onClick={onDelete}
              className="rounded-md border border-[var(--danger)] px-4 py-2 text-sm font-medium text-[var(--danger)] disabled:opacity-60"
            >
              Soft delete
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
