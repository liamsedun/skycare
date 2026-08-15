"use client";

import { useId } from "react";
import { CalendarRange, X } from "lucide-react";

const inputCls =
  "focus-ring h-9 rounded-lg border border-[var(--color-border)] bg-white px-2.5 text-xs text-[var(--color-foreground)] outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";

interface DateRangeBarProps {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onClear: () => void;
  fromLabel?: string;
  toLabel?: string;
  className?: string;
}

/**
 * From / To calendar pickers used to filter list views by a row's date.
 * Renders an inline "Date — From [x] To [y] (Clear)" bar that matches the
 * app's filter styling. When both dates are empty the Clear button hides.
 */
export default function DateRangeBar({
  from,
  to,
  onFromChange,
  onToChange,
  onClear,
  fromLabel = "From",
  toLabel = "To",
  className = "",
}: DateRangeBarProps) {
  const id = useId();
  const active = Boolean(from || to);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} role="group" aria-label="Filter by date range">
      <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted-fg)]">
        <CalendarRange size={14} aria-hidden="true" /> Date
      </span>
      <label className="text-xs text-[var(--color-muted-fg)]" htmlFor={`${id}-from`}>
        {fromLabel}
      </label>
      <input
        id={`${id}-from`}
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => onFromChange(e.target.value)}
        className={inputCls}
        aria-label={`${fromLabel} date`}
      />
      <label className="text-xs text-[var(--color-muted-fg)]" htmlFor={`${id}-to`}>
        {toLabel}
      </label>
      <input
        id={`${id}-to`}
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => onToChange(e.target.value)}
        className={inputCls}
        aria-label={`${toLabel} date`}
      />
      {active && (
        <button
          type="button"
          onClick={onClear}
          className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 text-xs font-medium text-[var(--color-muted-fg)] transition-colors duration-200 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <X size={13} aria-hidden="true" /> Clear
        </button>
      )}
    </div>
  );
}