"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  useState,
} from "react";
import { DisclosureBanner } from "../../../components/DisclosureBanner";
import { EmptyState } from "../../../components/EmptyState";
import {
  apiFetch,
  streamChatMessage,
  type ConversationDetail,
  type ConversationListItem,
  type ConversationMessage,
  type PersonaListItem,
  type PlanResponse,
} from "../../../lib/api";

function ChatHubInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("persona");
  const listRef = useRef<HTMLUListElement>(null);

  const [personas, setPersonas] = useState<PersonaListItem[]>([]);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [sessions, setSessions] = useState<ConversationListItem[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [quotaBlocked, setQuotaBlocked] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
        if (
          p.maxChatMessagesPerDay != null &&
          p.chatMessagesUsedToday >= p.maxChatMessagesPerDay
        ) {
          setQuotaBlocked(true);
        }
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

  const loadSessions = useCallback(async (personaId: string) => {
    const res = await apiFetch<{ data: ConversationListItem[] }>(
      `/personas/${personaId}/conversations`,
    );
    setSessions(res.data);
    return res.data;
  }, []);

  const openSession = useCallback(
    async (personaId: string, id: string) => {
      const detail = await apiFetch<ConversationDetail>(
        `/personas/${personaId}/conversations/${id}`,
      );
      setSessionId(detail.id);
      setMessages(detail.messages);
      setStreamingText("");
    },
    [],
  );

  useEffect(() => {
    if (!selected?.id || !selected.chatEligible) {
      setSessions([]);
      setSessionId(null);
      setMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await loadSessions(selected.id);
        if (cancelled) return;
        if (list[0]) {
          await openSession(selected.id, list[0].id);
        } else {
          const created = await apiFetch<{ id: string }>(
            `/personas/${selected.id}/conversations`,
            { method: "POST", body: "{}" },
          );
          if (cancelled) return;
          await loadSessions(selected.id);
          await openSession(selected.id, created.id);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.chatEligible, loadSessions, openSession]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  function selectPersona(id: string) {
    router.replace(`/chat?persona=${encodeURIComponent(id)}`);
  }

  function onListKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    if (personas.length === 0) return;
    const idx = selectedId
      ? personas.findIndex((p) => p.id === selectedId)
      : -1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = personas[Math.min(idx + 1, personas.length - 1)] ?? personas[0];
      if (next) selectPersona(next.id);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev =
        personas[Math.max(idx - 1, 0)] ?? personas[personas.length - 1];
      if (prev) selectPersona(prev.id);
    } else if (e.key === "Home") {
      e.preventDefault();
      const first = personas[0];
      if (first) selectPersona(first.id);
    } else if (e.key === "End") {
      e.preventDefault();
      const last = personas[personas.length - 1];
      if (last) selectPersona(last.id);
    }
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!selected?.chatEligible || !sessionId || !draft.trim() || sending || quotaBlocked) {
      return;
    }
    const text = draft.trim();
    setDraft("");
    setSending(true);
    setError(null);
    setStreamingText("");
    const tempUser: ConversationMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text,
      status: "complete",
      model: null,
      quality: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, tempUser]);

    try {
      let assembled = "";
      await streamChatMessage(selected.id, sessionId, text, {
        onToken: (t) => {
          assembled += t;
          setStreamingText(assembled);
        },
        onError: (data) => {
          setError(data.message ?? data.code ?? "Chat error");
        },
        onDone: () => {
          setStreamingText("");
        },
      });
      const detail = await apiFetch<ConversationDetail>(
        `/personas/${selected.id}/conversations/${sessionId}`,
      );
      setMessages(detail.messages);
      setStreamingText("");
      const nextPlan = await apiFetch<PlanResponse>("/me/plan");
      setPlan(nextPlan);
      if (
        nextPlan.maxChatMessagesPerDay != null &&
        nextPlan.chatMessagesUsedToday >= nextPlan.maxChatMessagesPerDay
      ) {
        setQuotaBlocked(true);
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "PLAN_LIMIT_CHAT_DAY") {
        setMessages((m) => m.filter((msg) => msg.id !== tempUser.id));
        setDraft(text);
        setQuotaBlocked(true);
        setError(
          "Daily chat limit reached for your plan. Upgrade to send more today.",
        );
      } else {
        setError((err as Error).message);
      }
    } finally {
      setSending(false);
    }
  }

  async function onNewChat() {
    if (!selected) return;
    setError(null);
    try {
      const created = await apiFetch<{ id: string }>(
        `/personas/${selected.id}/conversations`,
        { method: "POST", body: "{}" },
      );
      await loadSessions(selected.id);
      await openSession(selected.id, created.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Loading chat hub…</p>;
  }

  if (error && personas.length === 0) {
    return (
      <p className="text-sm text-[var(--danger)]" role="alert">
        {error}
      </p>
    );
  }

  if (personas.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-semibold tracking-tight">Chat</h1>
        <DisclosureBanner />
        <EmptyState
          title="No personas in Chat yet"
          description="Create a persona on the dashboard. It appears here automatically — there is no separate publish step."
          action={
            plan?.canCreatePersona ? (
              <Link
                href="/personas/new"
                className="inline-block text-sm font-medium text-[var(--accent)]"
              >
                Create persona →
              </Link>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                You are at your plan cap. Upgrade or wait until a purged persona
                frees a slot.
              </p>
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Chat</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Switch personas below. Use ↑/↓ when the list is focused.
        </p>
      </div>

      <DisclosureBanner />

      {error ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <p
            id="persona-switcher-label"
            className="border-b border-[var(--border)] px-3 py-2 text-xs font-medium tracking-wide text-[var(--muted)] uppercase"
          >
            Personas
          </p>
          <ul
            ref={listRef}
            role="listbox"
            aria-labelledby="persona-switcher-label"
            tabIndex={0}
            onKeyDown={onListKeyDown}
            className="max-h-[420px] overflow-auto py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]"
          >
            {personas.map((p) => {
              const active = p.id === selected?.id;
              return (
                <li key={p.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
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

        <section
          aria-live="polite"
          className="flex min-h-[360px] flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)]"
        >
          {selected ? (
            <>
              <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
                <div>
                  <h2 className="font-medium">{selected.displayName}</h2>
                  <p className="text-xs text-[var(--muted)]">
                    {selected.scenario} · {selected.status}
                    {sessions.length > 1
                      ? ` · ${sessions.length} conversations`
                      : ""}
                  </p>
                </div>
                {selected.chatEligible ? (
                  <button
                    type="button"
                    onClick={() => void onNewChat()}
                    className="text-xs text-[var(--accent)] underline underline-offset-2"
                  >
                    New chat
                  </button>
                ) : null}
              </header>

              <div className="flex flex-1 flex-col gap-3 overflow-auto px-4 py-4 text-sm">
                {!selected.chatEligible ? (
                  <p className="text-[var(--warn)]">
                    Conversations stay limited until{" "}
                    <strong>converse</strong> consent is granted on the persona.
                  </p>
                ) : (
                  <>
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={
                          m.role === "user"
                            ? "ml-8 rounded-md bg-[var(--background)] px-3 py-2"
                            : "mr-8 rounded-md border border-[var(--border)] px-3 py-2"
                        }
                      >
                        <p className="text-xs text-[var(--muted)]">
                          {m.role}
                          {m.status !== "complete" ? ` · ${m.status}` : ""}
                          {m.quality === "abstained" ? " · not in records" : ""}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
                        {m.role === "assistant" &&
                        m.citations &&
                        m.citations.length > 0 ? (
                          <ul className="mt-2 space-y-1 border-t border-[var(--border)] pt-2">
                            <li className="text-[10px] font-medium tracking-wide text-[var(--muted)] uppercase">
                              From your records
                            </li>
                            {m.citations.map((c) => (
                              <li
                                key={`${m.id}-${c.marker}`}
                                className="text-xs text-[var(--muted)]"
                              >
                                <span className="font-mono text-[10px]">
                                  {c.marker}
                                </span>
                                {c.quote
                                  ? ` — “${c.quote}${c.quote.length >= 180 ? "…" : ""}”`
                                  : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                    {streamingText ? (
                      <div className="mr-8 rounded-md border border-[var(--border)] px-3 py-2">
                        <p className="text-xs text-[var(--muted)]">
                          assistant · streaming
                        </p>
                        <p className="mt-1 whitespace-pre-wrap">
                          {streamingText}
                        </p>
                      </div>
                    ) : null}
                    <div ref={bottomRef} />
                  </>
                )}
              </div>

              <footer className="border-t border-[var(--border)] px-4 py-3">
                {plan &&
                plan.maxChatMessagesPerDay != null &&
                (quotaBlocked ||
                  plan.maxChatMessagesPerDay - plan.chatMessagesUsedToday <=
                    5) ? (
                  <p className="mb-2 text-xs text-[var(--muted)]">
                    {Math.max(
                      0,
                      plan.maxChatMessagesPerDay - plan.chatMessagesUsedToday,
                    )}{" "}
                    of {plan.maxChatMessagesPerDay} sends left today
                    {quotaBlocked ? (
                      <>
                        {" "}
                        ·{" "}
                        <Link
                          href="/settings"
                          className="text-[var(--accent)] underline underline-offset-2"
                        >
                          See plan
                        </Link>
                      </>
                    ) : null}
                  </p>
                ) : null}
                <form className="flex gap-2" onSubmit={onSend}>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={
                      !selected.chatEligible ||
                      sending ||
                      !sessionId ||
                      quotaBlocked
                    }
                    aria-label="Message"
                    placeholder={
                      quotaBlocked
                        ? "Daily send limit reached"
                        : selected.chatEligible
                          ? "Ask about what is in the records…"
                          : "Composer unlocks after converse consent"
                    }
                    className="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm disabled:text-[var(--muted)]"
                  />
                  <button
                    type="submit"
                    disabled={
                      !selected.chatEligible ||
                      sending ||
                      !sessionId ||
                      !draft.trim() ||
                      quotaBlocked
                    }
                    className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {sending ? "…" : "Send"}
                  </button>
                </form>
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
