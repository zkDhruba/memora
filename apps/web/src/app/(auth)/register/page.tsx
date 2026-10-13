"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { apiFetch } from "../../../lib/api";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiFetch<{ userId: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, displayName }),
      });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-[var(--muted)]">
          We sent a verification link to <strong>{email}</strong>. Open{" "}
          <a className="text-[var(--accent)]" href="http://localhost:8025">
            Mailpit
          </a>{" "}
          locally, then{" "}
          <Link href="/login" className="text-[var(--accent)]">
            sign in
          </Link>
          .
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <Link href="/" className="text-sm font-semibold text-[var(--accent)]">
        Memora
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">Create account</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Display name
          <input
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            required
            maxLength={80}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password (min 10)
          <input
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            type="password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Creating…" : "Register"}
        </button>
      </form>
      <p className="text-sm text-[var(--muted)]">
        Already have an account?{" "}
        <Link href="/login" className="text-[var(--accent)]">
          Sign in
        </Link>
      </p>
    </main>
  );
}
