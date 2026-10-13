"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "../../components/AppNav";
import { apiFetch, type MeResponse } from "../../lib/api";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<MeResponse>("/me")
      .then((data) => {
        if (!cancelled) setMe(data);
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted)]">
        Loading…
      </div>
    );
  }

  if (!me) return null;

  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="absolute top-3 left-3 z-50 -translate-y-16 rounded-md bg-[var(--surface)] px-3 py-2 text-sm shadow transition focus:translate-y-0 focus:outline focus:outline-2 focus:outline-[var(--accent)]"
      >
        Skip to main content
      </a>
      <AppNav email={me.email} />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-6 py-8 outline-none">
        {children}
      </main>
    </div>
  );
}
