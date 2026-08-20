"use client";

import { useCallback, useEffect, useState } from "react";
import { Tag, Search, Trash2, CheckCircle2 } from "lucide-react";
import { mutedXs, mutedXsMt, cardShell } from "@/lib/ui-constants";
import { inputCls, btnPrimary, ngn } from "./pharmacy-admin-shared";

// ---------------------------------------------------------------------------
// PRICES TAB (multi-branch overrides)
// ---------------------------------------------------------------------------
interface OverrideRow {
  id: string;
  drugId: string;
  drugName: string;
  branchId: string | null;
  branchName: string;
  unitPrice: number;
  note: string | null;
}
interface BranchRow { id: string; name: string; code: string | null; isMain: boolean; isActive: boolean }
interface DrugOption { id: string; name: string; dosage: string | null; category: string; unitPrice: number }

export function PricesTab({ viewOnly = false }: { viewOnly?: boolean }) {
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<DrugOption[]>([]);
  const [open, setOpen] = useState(false);
  const [drugId, setDrugId] = useState<string | null>(null);
  const [drugName, setDrugName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOverrides = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pharmacy/admin/prices", { cache: "no-store" });
      if (res.ok) setOverrides((await res.json()).data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverrides();
    (async () => {
      const res = await fetch("/api/pharmacy/admin/branches", { cache: "no-store" });
      if (res.ok) setBranches((await res.json()).data ?? []);
    })();
  }, [loadOverrides]);

  useEffect(() => {
    if (search.trim().length < 2) { setResults([]); setOpen(false); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/pharmacy/drugs?query=${encodeURIComponent(search)}`, { cache: "no-store" });
      if (res.ok) { setResults((await res.json()).data ?? []); setOpen(true); }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (!drugId) throw new Error("Pick a drug first");
      const res = await fetch("/api/pharmacy/admin/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drugId, branchId: branchId || null, unitPrice: Number(price), note: note || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      setPrice("");
      setNote("");
      setDrugId(null);
      setDrugName("");
      await loadOverrides();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const lbl = "mb-1 block text-xs font-medium text-[var(--color-foreground)]";

  return (
    <div className={`grid gap-5 ${viewOnly ? "lg:grid-cols-1" : "lg:grid-cols-2"}`}>
      {!viewOnly && (
      <div className={cardShell}>
        <h3 className="text-sm font-bold text-[var(--color-foreground)]">Set a branch price</h3>
        <p className={mutedXsMt}>
          Applies an override for one branch â€” leave branch on â€œAll branchesâ€ for a base price used everywhere else.
        </p>

        <div className="relative mt-4">
          <label className={lbl} htmlFor="pr-search">Drug</label>
          <div className="relative">
            <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-[var(--color-muted-fg)]" />
            <input
              id="pr-search"
              value={drugName || search}
              onChange={(e) => { setSearch(e.target.value); setDrugId(null); setDrugName(""); }}
              onFocus={() => { if (search.trim().length >= 2) setOpen(true); }}
              placeholder="Search the catalogueâ€¦"
              className={`${inputCls} pl-9`}
            />
          </div>
          {open && results.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white shadow-lg">
              {results.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => { setDrugId(d.id); setDrugName(d.name); setSearch(""); setOpen(false); }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-primary-soft)]"
                  >
                    <span className="block font-medium">{d.name}</span>
                    <span className="block text-xs text-[var(--color-muted-fg)]">
                      {[d.dosage, d.category].filter(Boolean).join(" Â· ")} Â· {ngn(d.unitPrice)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3">
          <label className={lbl} htmlFor="pr-branch">Branch</label>
          <select id="pr-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.isMain ? " (main)" : ""}</option>)}
          </select>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={lbl} htmlFor="pr-price">Price (â‚¦)</label>
            <input id="pr-price" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={lbl} htmlFor="pr-note">Note</label>
            <input id="pr-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="optional" />
          </div>
        </div>

        {error && <p role="alert" className="mt-3 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>}

        <button type="button" onClick={save} disabled={busy || !drugId} className={btnPrimary + " mt-4"}>
          <Tag size={14} aria-hidden="true" /> {busy ? "Savingâ€¦" : "Save override"}
        </button>
      </div>
      )}

      <div className={cardShell}>
        <h3 className="text-sm font-bold text-[var(--color-foreground)]">Active overrides</h3>
        {loading ? (
          <p className="py-6 text-center text-xs text-[var(--color-muted-fg)]">Loadingâ€¦</p>
        ) : overrides.length === 0 ? (
          <div className="py-6 text-center">
            <CheckCircle2 size={28} aria-hidden="true" className="mx-auto text-emerald-500" />
            <p className="mt-2 text-xs text-[var(--color-muted-fg)]">No overrides yet â€” all branches use the retail price.</p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {overrides.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--color-foreground)]">{o.drugName}</p>
                  <p className={mutedXs}>
                    {o.branchName}{o.note ? ` Â· ${o.note}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-semibold text-[var(--color-primary)]">{ngn(o.unitPrice)}</span>
                  {!viewOnly && (
                  <button
                    type="button"
                    className="focus-ring rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-red-50 hover:text-red-600"
                    aria-label="Remove override"
                    onClick={async () => {
                      await fetch(`/api/pharmacy/admin/prices/${o.id}`, { method: "DELETE" });
                      await loadOverrides();
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}