import type { ReactNode, ComponentType } from "react";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * Shared UI kit for the SkyCare patient app mobile view (Life Blossom design parity).
 * Mobile-only: pages render these inside `md:hidden` trees; the web views (md+)
 * are untouched. All fills/text use SkyCare theme tokens so light/dark modes
 * keep working; gold gradient accents stay gold in both themes (per spec).
 */

export const APP_CARD =
  "app-glass relative overflow-hidden rounded-2xl";
export const GOLD_TEXT = "#e0a84a";
export const GOLD_GRADIENT =
  "bg-gradient-to-r from-[#e0a84a] to-amber-500 text-[#0a0f1a] shadow-lg shadow-[#e0a84a]/20";
export const GOLD_GRADIENT_BR =
  "bg-gradient-to-br from-[#e0a84a] to-amber-500 text-[#0a0f1a] shadow-lg shadow-[#e0a84a]/20";

/** Glass card with the corner gold glow (Life Blossom pattern). */
export function AppCard({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(APP_CARD, className)}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-[#e0a84a]/[0.05] to-transparent"
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** tappable row card (Link semantics handled by caller). */
export function AppRowCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(APP_CARD, "transition-all duration-300 hover:border-white/20", className)}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-[#e0a84a]/[0.05] to-transparent"
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** Page title row: bold title + optional trailing pill (LB pattern). */
export function AppHeader({
  title,
  meta,
  icon,
}: {
  title: string;
  meta?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--color-foreground)]">
        {title}
        {icon}
      </h2>
      {meta && (
        <span className="shrink-0 rounded-full bg-[var(--color-muted)] px-2.5 py-1 text-xs text-[var(--color-muted-fg)]">
          {meta}
        </span>
      )}
    </div>
  );
}

/** LB segmented control: Upcoming/Past, All/Unread… */
export function AppSegmented<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: Array<{ key: T; label: string }>;
  active: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex rounded-xl border border-[var(--color-border)] bg-slate-100 p-1", className)}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          aria-pressed={active === t.key}
          className={cn(
            "h-9 flex-1 rounded-lg text-sm font-medium transition-all duration-200",
            active === t.key
              ? "bg-white text-[var(--color-foreground)] shadow-sm"
              : "text-[var(--color-muted-fg)] hover:text-[var(--color-foreground)]"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Scrollable filter pill row; active pill = gold gradient (LB). */
export function AppFilterChips<T extends string>({
  filters,
  active,
  onChange,
}: {
  filters: Array<{ key: T; label: string }>;
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {filters.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onChange(f.key)}
          aria-pressed={active === f.key}
          className={cn(
            "h-8 shrink-0 rounded-xl px-4 text-xs font-medium whitespace-nowrap transition-all duration-200",
            active === f.key
              ? GOLD_GRADIENT
              : "border border-[var(--color-border)] bg-slate-100 text-[var(--color-muted-fg)] hover:bg-slate-200"
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

/** Gold primary button. */
export function GoldButton({
  children,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-200 hover:shadow-lg disabled:opacity-50",
        GOLD_GRADIENT,
        className
      )}
    >
      {children}
    </button>
  );
}

/** Ghost / secondary button (LB "Cancel" style). */
export function GhostButton({
  children,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] text-sm font-medium text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-slate-100",
        className
      )}
    >
      {children}
    </button>
  );
}

/** Status chip: translucent colored pill (LB + SkyCare theme remaps). */
export function AppStatusChip({ status }: { status: string }) {
  const look: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-700 border-emerald-500/20",
    completed: "bg-emerald-100 text-emerald-700 border-emerald-500/20",
    confirmed: "bg-sky-100 text-sky-700 border-sky-500/20",
    dispensed: "bg-emerald-100 text-emerald-700 border-emerald-500/20",
    ready: "bg-emerald-100 text-emerald-700 border-emerald-500/20",
    pending: "bg-amber-100 text-amber-700 border-amber-500/20",
    scheduled: "bg-amber-100 text-amber-700 border-amber-500/20",
    partially_paid: "bg-amber-100 text-amber-700 border-amber-500/20",
    partially_dispensed: "bg-amber-100 text-amber-700 border-amber-500/20",
    in_progress: "bg-amber-100 text-amber-700 border-amber-500/20",
    sample_collected: "bg-amber-100 text-amber-700 border-amber-500/20",
    active: "bg-amber-100 text-amber-700 border-amber-500/20",
    cancelled: "bg-rose-100 text-rose-700 border-rose-500/20",
    no_show: "bg-rose-100 text-rose-700 border-rose-500/20",
    failed: "bg-rose-100 text-rose-700 border-rose-500/20",
    refunded: "bg-slate-100 text-slate-500 border-slate-500/20",
  };
  const cls = look[status] ?? "border border-[var(--color-border)] bg-slate-100 text-[var(--color-muted-fg)]";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        cls
      )}
    >
      {status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}
    </span>
  );
}

/** Bottom-sheet modal (LB: items-end on phones, centered sheet on sm+). */
export function AppSheet({
  open,
  onClose,
  children,
  title,
  maxW = "max-w-sm",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  maxW?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          "app-glass-strong max-h-[90vh] w-full overflow-y-auto rounded-t-2xl p-5 shadow-2xl sm:rounded-2xl",
          maxW
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--color-border)] sm:hidden" />
        {title && <div className="mb-4 flex items-center justify-between">{title}</div>}
        {children}
      </div>
    </div>
  );
}

/** Gold circular FAB (LB: fixed above the bottom nav). */
export function AppFab({
  onClick,
  label,
  children,
  className,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full transition-all duration-200 hover:scale-110 active:scale-95",
        GOLD_GRADIENT_BR,
        className
      )}
    >
      {children}
    </button>
  );
}

/** Pulse skeleton rows (LB loading state). */
export function AppSkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="app-glass h-20 animate-pulse rounded-2xl" />
      ))}
    </div>
  );
}

/** Centered empty state (LB). */
export function AppEmpty({
  icon: Icon,
  title,
  hint,
}: {
  icon: ComponentType<{ className?: string; size?: number; "aria-hidden"?: boolean | "true" | "false" }>;
  title: string;
  hint?: string;
}) {
  return (
    <AppCard className="py-10 text-center">
      <Icon className="mx-auto h-10 w-10 text-[var(--color-muted-fg)]" aria-hidden />
      <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">{title}</p>
      {hint && <p className="mt-1 text-xs text-[var(--color-muted-fg)]">{hint}</p>}
    </AppCard>
  );
}

/** Avatar tile: uploaded photo or gold-gradient initials (LB). */
export function AppAvatarTile({
  avatarUrl,
  name,
  size = "h-11 w-11",
}: {
  avatarUrl?: string | null;
  name: string;
  size?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("") || "?";
  if (avatarUrl) {
    return (
      <div className={cn("shrink-0 overflow-hidden rounded-xl", size)}>
        <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#e0a84a]/25 to-[#e0a84a]/5 text-sm font-bold text-[#e0a84a]",
        size
      )}
    >
      {initials}
    </div>
  );
}