"use client";

import { useState, useRef, useEffect } from "react";
import { Building2, Check, ChevronDown } from "lucide-react";
import { useBranch } from "@/lib/branch-context";

export default function BranchSwitcher() {
  const { branches, selectedBranchId, selectedBranch, setSelectedBranchId, loading } = useBranch();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  if (loading || branches.length <= 1) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-xs font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-muted)]"
        aria-label="Switch branch"
        aria-expanded={open}
      >
        <Building2 size={14} className="shrink-0 text-[var(--color-muted-fg)]" />
        <span className="max-w-[120px] truncate">
          {selectedBranch?.name ?? "All branches"}
        </span>
        <ChevronDown size={12} className={`shrink-0 text-[var(--color-muted-fg)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] shadow-lg">
          <div className="max-h-64 overflow-y-auto p-1">
            {/* All branches option */}
            <button
              type="button"
              onClick={() => { setSelectedBranchId(null); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-muted)]"
            >
              <span className="flex-1 truncate font-medium">All branches</span>
              {selectedBranchId === null && <Check size={14} className="shrink-0 text-[var(--color-primary)]" />}
            </button>

            <div className="my-1 h-px bg-[var(--color-border)]" />

            {branches.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => { setSelectedBranchId(b.id); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-muted)]"
              >
                <span className="flex-1 truncate">
                  {b.name}
                  {b.is_main && <span className="ml-1 text-[10px] text-[var(--color-muted-fg)]">(main)</span>}
                </span>
                {selectedBranchId === b.id && <Check size={14} className="shrink-0 text-[var(--color-primary)]" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
