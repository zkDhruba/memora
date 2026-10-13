import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <p className="text-sm font-medium tracking-[0.2em] text-[var(--accent)] uppercase">
        Memora
      </p>
      <h1 className="max-w-2xl text-4xl leading-tight font-semibold tracking-tight md:text-5xl">
        A disclosed AI simulation built from records you authorize.
      </h1>
      <p className="max-w-xl text-lg text-[var(--muted)]">
        Create a persona, feed it sources over time, and chat in text. Version 1
        never claims to be the person.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/register"
          className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white"
        >
          Create account
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 text-sm font-medium"
        >
          Sign in
        </Link>
        <Link
          href="/dashboard"
          className="rounded-md px-5 py-2.5 text-sm font-medium text-[var(--muted)]"
        >
          Dashboard
        </Link>
      </div>
    </main>
  );
}
