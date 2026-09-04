"use client";

import { type ReactNode, useEffect, useRef } from "react";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/* ── Design tokens ── */
export const ACCENT = "#0ea5e9";
export const ACCENT_LIGHT = "#e0f2fe";
export const ACCENT_GRADIENT = "linear-gradient(135deg, #0ea5e9 0%, #0284c7 50%, #0369a1 100%)";
export const ACCENT_GRADIENT_BR = "linear-gradient(135deg, #0284c7 0%, #0ea5e9 50%, #38bdf8 100%)";

/* ── Card wrappers ── */
export function PlatformGlassCard({
  children,
  className,
  hover = false,
  style,
}: {
  children?: ReactNode;
  className?: string;
  hover?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5",
        "shadow-sm transition-all duration-300",
        hover && "hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm",
        className
      )}
      style={style}
    >
      {children}
    </div>
  );
}

/* ── Accent glow orb (decorative, top-right corner) ── */
export function AccentGlow({ color = ACCENT }: { color?: string }) {
  return (
    <span
      className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full opacity-[0.07] blur-2xl"
      style={{ background: color }}
    />
  );
}

/* ── Page header ── */
export function PlatformPageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[var(--color-muted-fg)]">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

/* ── Status chip ── */
const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  trial: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  suspended: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  past_due: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  inactive: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  open: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  closed: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400",
  resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  high: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  low: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400",
};

export function StatusChip({ status, label }: { status: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", STATUS_STYLES[status] || STATUS_STYLES.inactive)}>
      {label || status.replace(/_/g, " ")}
    </span>
  );
}

/* ── Bottom Sheet (mobile modal) ── */
export function PlatformSheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={ref} className="platform-overlay" onClick={onClose}>
      <div
        className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 pb-8 shadow-2xl sm:static sm:bottom-auto sm:left-auto sm:right-auto sm:mx-auto sm:mt-8 sm:w-full sm:max-w-lg sm:rounded-xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 hidden h-1 w-10 rounded-full bg-[var(--color-border)] sm:block" />
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]">
              &times;
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/* ── Skeleton loader ── */
export function PlatformSkeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-[var(--color-muted)]", className)} />;
}

/* ── Empty state ── */
export function PlatformEmpty({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-muted)] text-[var(--color-muted-fg)]">
        {icon}
      </div>
      <p className="text-base font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm text-[var(--color-muted-fg)]">{hint}</p>}
    </div>
  );
}
