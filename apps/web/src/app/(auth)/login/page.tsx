"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { apiFetch } from "../../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          ...(totp ? { totp } : {}),
        }),
      });
      router.push("/dashboard");
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "MFA_REQUIRED") {
        setNeedsMfa(true);
        setError("Enter your authenticator code.");
      } else {
        setError((err as Error).message);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <Link href="/" className="text-sm font-semibold text-[var(--accent)]">
        Memora
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
          Password
          <input
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            type="password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {needsMfa ? (
          <label className="flex flex-col gap-1 text-sm">
            Authenticator code
            <input
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
            />
          </label>
        ) : null}
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="text-sm text-[var(--muted)]">
        No account?{" "}
        <Link href="/register" className="text-[var(--accent)]">
          Register
        </Link>
      </p>
    </main>
  );
}
