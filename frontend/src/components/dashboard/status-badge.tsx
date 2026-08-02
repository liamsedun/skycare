const TONES: Record<string, string> = {
  scheduled: "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]",
  confirmed: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
  in_progress: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
  completed: "bg-[var(--color-accent-soft)] text-[var(--color-accent-dark)]",
  paid: "bg-[var(--color-accent-soft)] text-[var(--color-accent-dark)]",
  cancelled: "bg-slate-100 text-slate-500",
  no_show: "bg-[var(--color-destructive-soft)] text-[var(--color-destructive)]",
  failed: "bg-[var(--color-destructive-soft)] text-[var(--color-destructive)]",
  active: "bg-[var(--color-accent-soft)] text-[var(--color-accent-dark)]",
  inactive: "bg-slate-100 text-slate-500",
};

export default function StatusBadge({ status }: { status: string }) {
  const tone = TONES[status] ?? "bg-slate-100 text-slate-600";
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
