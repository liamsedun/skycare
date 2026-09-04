"use client";

import { useBranch } from "@/lib/branch-context";

/**
 * Reusable branch filter dropdown for list views.
 * Reads branches from BranchProvider context.
 *
 * Usage:
 *   const { branchFilter, setBranchFilter } = useBranchFilter();
 *   <BranchFilter value={branchFilter} onChange={setBranchFilter} />
 *   // pass ?branch={branchFilter} to API calls
 */
export function useBranchFilter() {
  const { selectedBranchId } = useBranch();
  return { branchFilter: selectedBranchId };
}

interface BranchFilterProps {
  value: string | null;
  onChange: (branchId: string | null) => void;
  /** Hide when there's only one branch (no choice to make) */
  hideWhenSingle?: boolean;
  className?: string;
}

export default function BranchFilter({ value, onChange, hideWhenSingle, className }: BranchFilterProps) {
  const { branches, loading } = useBranch();

  if (loading || branches.length === 0) return null;
  if (hideWhenSingle && branches.length <= 1) return null;

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-muted)] ${className ?? ""}`}
      aria-label="Filter by branch"
    >
      <option value="">All branches</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}{b.is_main ? " (main)" : ""}
        </option>
      ))}
    </select>
  );
}
