import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
