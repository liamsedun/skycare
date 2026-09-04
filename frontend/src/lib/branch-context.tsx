"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface Branch {
  id: string;
  name: string;
  code: string | null;
  is_main: boolean;
}

interface BranchContextValue {
  branches: Branch[];
  selectedBranchId: string | null; // null = "All branches"
  selectedBranch: Branch | null;
  setSelectedBranchId: (id: string | null) => void;
  loading: boolean;
}

const BranchCtx = createContext<BranchContextValue>({
  branches: [],
  selectedBranchId: null,
  selectedBranch: null,
  setSelectedBranchId: () => {},
  loading: true,
});

const STORAGE_KEY = "skycare-branch";

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/branches", { credentials: "include" });
        if (res.ok) {
          const body = await res.json();
          const rows = (body.data ?? []) as Branch[];
          if (!cancelled) {
            setBranches(rows);
            // Restore from localStorage, validate it still exists
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored && rows.some((b) => b.id === stored)) {
              setSelectedBranchIdState(stored);
            } else if (stored === "all") {
              setSelectedBranchIdState(null);
            }
          }
        }
      } catch {
        // Ignore — branches stay empty, user sees "All branches"
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setSelectedBranchId = useCallback((id: string | null) => {
    setSelectedBranchIdState(id);
    if (id === null) {
      localStorage.setItem(STORAGE_KEY, "all");
    } else {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const selectedBranch = branches.find((b) => b.id === selectedBranchId) ?? null;

  return (
    <BranchCtx.Provider value={{ branches, selectedBranchId, selectedBranch, setSelectedBranchId, loading }}>
      {children}
    </BranchCtx.Provider>
  );
}

export function useBranch() {
  return useContext(BranchCtx);
}

/** Build a URLSearchParams with branch filter applied. Call from any client component. */
export function branchParams(extra?: Record<string, string | null | undefined>): URLSearchParams {
  // This is a simple helper — the actual branch ID must come from the component
  const p = new URLSearchParams();
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v != null && v !== "") p.set(k, v);
    }
  }
  return p;
}
