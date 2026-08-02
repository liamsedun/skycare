import type { LucideIcon } from "lucide-react";

export default function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "primary" | "accent" | "warning" | "destructive";
}) {
  const tones: Record<string, string> = {
    primary: "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]",
    accent: "bg-[var(--color-accent-soft)] text-[var(--color-accent-dark)]",
    warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
    destructive: "bg-[var(--color-destructive-soft)] text-[var(--color-destructive)]",
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--color-muted-fg)]">{label}</p>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}
        >
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-foreground)] sm:text-3xl">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-[var(--color-muted-fg)]">{hint}</p>}
    </div>
  );
}
