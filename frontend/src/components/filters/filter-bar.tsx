"use client";

import { useId } from "react";
import { Search, X } from "lucide-react";
import DateRangeBar from "@/components/filters/date-range-bar";

const inputCls =
  "focus-ring h-9 rounded-lg border border-[var(--color-border)] bg-white px-3 pl-9 text-sm text-[var(--color-foreground)] outline-none transition-colors duration-200 placeholder:text-[var(--color-muted-fg)] focus:border-[var(--color-primary)]";

interface FilterBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onClear: () => void;
  searchPlaceholder?: string;
  searchWidth?: number | string;
  showDateRange?: boolean;
  className?: string;
}

/**
 * Shared list filter row: a free-text search box plus From / To calendar
 * pickers. `onClear` resets every filter (search + dates). Set
 * `showDateRange={false}` when the page already has its own date pickers.
 */
export default function FilterBar({
  query,
  onQueryChange,
  from,
  to,
  onFromChange,
  onToChange,
  onClear,
  searchPlaceholder = "Search…",
  searchWidth,
  showDateRange = true,
  className = "",
}: FilterBarProps) {
  const id = useId();
  const active = Boolean(query.trim() || from || to);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} role="group" aria-label="Search and date filters">
      <div className="relative">
        <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
        <input
          id={id}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={searchPlaceholder}
          className={inputCls}
          style={searchWidth ? { width: searchWidth } : undefined}
          aria-label={searchPlaceholder}
        />
      </div>
      {showDateRange && (
        <DateRangeBar from={from} to={to} onFromChange={onFromChange} onToChange={onToChange} onClear={onClear} />
      )}
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
