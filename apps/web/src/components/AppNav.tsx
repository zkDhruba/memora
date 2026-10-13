"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "../lib/api";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/chat", label: "Chat" },
  { href: "/settings", label: "Settings" },
] as const;

export function AppNav({ email }: { email?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLogout() {
    setPending(true);
    setError(null);
    try {
      await apiFetch("/auth/logout", { method: "POST" });
      router.replace("/login");
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <Link
          href="/dashboard"
          className="text-lg font-semibold tracking-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Memora
        </Link>
        <nav aria-label="Primary" className="flex flex-wrap items-center gap-1">
          {links.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          {email ? (
            <p className="hidden max-w-[14rem] truncate text-xs text-[var(--muted)] sm:block">
              {email}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onLogout}
            disabled={pending}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
          >
            {pending ? "Signing out…" : "Log out"}
          </button>
        </div>
      </div>
      {error ? (
        <p className="mx-auto max-w-5xl px-6 pb-3 text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </header>
  );
}
