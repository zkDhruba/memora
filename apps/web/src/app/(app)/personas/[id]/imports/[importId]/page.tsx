"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ALLOWED_UPLOAD_MEDIA_TYPES } from "@memora/shared";
import { EmptyState } from "../../../../../../components/EmptyState";
import { JobProgress } from "../../../../../../components/JobProgress";
import {
  apiFetch,
  type ImportProgress,
  type SourceParticipant,
} from "../../../../../../lib/api";

const POLL_MS = 2000;

function isImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|heic|bmp|tiff?)$/i.test(file.name)
  );
}

function guessMediaType(file: File): string {
  if (
    file.type &&
    (ALLOWED_UPLOAD_MEDIA_TYPES as readonly string[]).includes(file.type)
  ) {
    return file.type;
  }
  const name = file.name.toLowerCase();
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "text/markdown";
  if (name.endsWith(".txt") || name.endsWith("_chat.txt")) return "text/plain";
  if (name.endsWith(".csv")) return "text/csv";
  if (name.endsWith(".json")) return "application/json";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (name.endsWith(".doc")) return "application/msword";
  if (name.endsWith(".zip")) return "application/zip";
  return "text/plain";
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function ImportProgressPage() {
  const { id: personaId, importId } = useParams<{
    id: string;
    importId: string;
  }>();
  const [imp, setImp] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mappingFileId, setMappingFileId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<SourceParticipant[]>([]);
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const [mapPending, setMapPending] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [deletingImport, setDeletingImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<ImportProgress>(
        `/personas/${personaId}/imports/${importId}`,
      );
      setImp(data);
      setError(null);
      terminalRef.current = data.terminal;
      return data;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, [personaId, importId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!imp || imp.terminal) return;
    const timer = setInterval(() => {
      if (terminalRef.current) return;
      void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [imp?.terminal, load, imp]);

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        if (isImageFile(file)) {
          throw new Error(
            `${file.name}: screenshots/images are not supported yet. Export the WhatsApp chat as a .txt file (Chat info → Export chat → Without media).`,
          );
        }
        const mediaType = guessMediaType(file);
        if (
          !(ALLOWED_UPLOAD_MEDIA_TYPES as readonly string[]).includes(mediaType)
        ) {
          throw new Error(`Unsupported type for ${file.name}`);
        }
        const buffer = await file.arrayBuffer();
        const sha256 = await sha256Hex(buffer);

        const pre = await apiFetch<{
          fileId: string;
          url: string;
          headers: Record<string, string>;
        }>(`/personas/${personaId}/files/presign`, {
          method: "POST",
          body: JSON.stringify({
            importId,
            filename: file.name,
            mediaType,
            byteSize: file.size,
          }),
        });

        const put = await fetch(pre.url, {
          method: "PUT",
          headers: pre.headers,
          body: buffer,
        });
        if (!put.ok) {
          throw new Error(`Upload failed for ${file.name} (${put.status})`);
        }

        await apiFetch(`/personas/${personaId}/files/${pre.fileId}/complete`, {
          method: "POST",
          body: JSON.stringify({ sha256 }),
        });
      }
      await load();
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function openMapping(fileId: string) {
    setMappingFileId(fileId);
    setSelectedParticipantId("");
    try {
      const res = await apiFetch<{ data: SourceParticipant[] }>(
        `/personas/${personaId}/files/${fileId}/participants`,
      );
      setParticipants(res.data);
      setSelectedParticipantId(res.data[0]?.id ?? "");
    } catch (err) {
      setUploadError((err as Error).message);
      setMappingFileId(null);
    }
  }

  async function saveMapping() {
    if (!mappingFileId || !selectedParticipantId) return;
    setMapPending(true);
    try {
      await apiFetch(
        `/personas/${personaId}/files/${mappingFileId}/subject-mapping`,
        {
          method: "POST",
          body: JSON.stringify({ participantId: selectedParticipantId }),
        },
      );
      setMappingFileId(null);
      await load();
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setMapPending(false);
    }
  }

  async function onDeleteFile(fileId: string, name: string) {
    if (
      !confirm(
        `Delete “${name}” and remove its training content (chunks, messages, parsed text)? Other files stay.`,
      )
    ) {
      return;
    }
    setDeletingFileId(fileId);
    setUploadError(null);
    try {
      await apiFetch(`/personas/${personaId}/files/${fileId}`, {
        method: "DELETE",
      });
      await load();
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setDeletingFileId(null);
    }
  }

  async function onDeleteImport() {
    if (
      !confirm(
        "Delete this entire import? All files in it and their training content will be removed.",
      )
    ) {
      return;
    }
    setDeletingImport(true);
    setUploadError(null);
    try {
      await apiFetch(`/personas/${personaId}/imports/${importId}`, {
        method: "DELETE",
      });
      window.location.href = `/personas/${personaId}`;
    } catch (err) {
      setUploadError((err as Error).message);
      setDeletingImport(false);
    }
  }

  if (!imp && !error) {
    return <p className="text-sm text-[var(--muted)]">Loading import…</p>;
  }

  if (!imp) {
    return <p className="text-sm text-[var(--danger)]">{error}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/personas/${personaId}`}
          className="text-sm text-[var(--muted)]"
        >
          ← Persona
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Import progress
            </h1>
            <p className="text-sm text-[var(--muted)]">
              {imp.fileCount} file{imp.fileCount === 1 ? "" : "s"} · status{" "}
              {imp.status}
              {imp.terminal ? " · complete" : " · updating…"}
            </p>
          </div>
          <button
            type="button"
            disabled={deletingImport}
            onClick={() => void onDeleteImport()}
            className="rounded-md border border-[var(--danger)] px-3 py-1.5 text-sm text-[var(--danger)] disabled:opacity-60"
          >
            {deletingImport ? "Deleting…" : "Delete import"}
          </button>
        </div>
      </div>

      <JobProgress
        label="Overall"
        percent={imp.percent}
        detail={
          imp.terminal
            ? "All files reached a terminal state. Polling stopped."
            : "Polling every 2 seconds while work is in progress."
        }
      />

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-sm font-medium">Add files</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          TXT, Markdown, DOCX, PDF, CSV, JSON, or WhatsApp export.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="mt-3 block w-full text-sm"
          disabled={uploading || imp.status !== "open"}
          onChange={(e) => void onUpload(e.target.files)}
        />
        {uploading ? (
          <p className="mt-2 text-sm text-[var(--muted)]">Uploading…</p>
        ) : null}
        {uploadError ? (
          <p className="mt-2 text-sm text-[var(--danger)]">{uploadError}</p>
        ) : null}
      </section>

      {imp.files.length === 0 ? (
        <EmptyState
          title="No files in this import yet"
          description="Choose files above. Progress appears here after upload and scan."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {imp.files.map((f) => (
            <li
              key={f.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{f.originalFilename}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {f.status}
                    {f.stage ? ` · ${f.stage}` : ""}
                    {f.jobStatus ? ` (${f.jobStatus})` : ""}
                    {f.parseFormat ? ` · ${f.parseFormat}` : ""}
                    {f.chunkCount != null ? ` · ${f.chunkCount} chunks` : ""}
                    {f.needsSubjectMapping ? " · needs subject mapping" : ""}
                  </p>
                  {f.errorCode ? (
                    <p className="text-sm text-[var(--danger)]">{f.errorCode}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {f.needsSubjectMapping ? (
                    <button
                      type="button"
                      className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
                      onClick={() => void openMapping(f.id)}
                    >
                      Map subject
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={deletingFileId === f.id}
                    className="rounded-md border border-[var(--danger)] px-3 py-1.5 text-sm text-[var(--danger)] disabled:opacity-60"
                    onClick={() => void onDeleteFile(f.id, f.originalFilename)}
                  >
                    {deletingFileId === f.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
              <div className="mt-3">
                <JobProgress label={f.originalFilename} percent={f.percent} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {mappingFileId ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
          <p className="font-medium">Which name is the persona subject?</p>
          <div className="mt-2 flex flex-col gap-2">
            {participants.map((p) => (
              <label key={p.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="subject"
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
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={mapPending || !selectedParticipantId}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              onClick={() => void saveMapping()}
            >
              Save mapping
            </button>
            <button
              type="button"
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm"
              onClick={() => setMappingFileId(null)}
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
