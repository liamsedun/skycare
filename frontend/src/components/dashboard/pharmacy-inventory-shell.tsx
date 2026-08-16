"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Package, Upload, Download, CheckCircle2, ChevronDown } from "lucide-react";
import type { AccessLevel } from "@/lib/nav";
import PharmacyStockView from "@/components/dashboard/pharmacy-stock-view";
import { ImportTab } from "@/components/dashboard/pharmacy-admin-view";

// ============================================================================
// Pharmacy → Drug Inventory — stock levels & movements, catalogue, bulk import.
// Stock and catalogue were merged into one view: the inventory table carries
// stock operations (restock / transfer / dispense / batches) AND catalogue
// administration (add / edit / archive, retail & effective pricing).
// Bulk import lives under the data menu (upload/download icons); Bulk export
// (CSV of the whole inventory) is the download action.
// ============================================================================

export default function PharmacyInventoryShell({ accessLevel = "full", myRole }: { accessLevel?: AccessLevel; myRole?: string }) {
  const viewOnly = accessLevel === "view_only";
  const [tab, setTab] = useState<"stock" | "import">("stock");
  const [menuOpen, setMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const runExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/pharmacy/inventory/export", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `drug-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const count = res.headers.get("x-row-count");
      showToast(`Bulk export complete — ${count ? `${count} drugs` : "CSV downloaded"}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
      setMenuOpen(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Drug Inventory</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
            Stock levels, batch tracking, catalogue, bulk import and export.
          </p>
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Inventory section">
          <button
            type="button"
            onClick={() => setTab("stock")}
            aria-pressed={tab === "stock"}
            className={`focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors duration-200 ${
              tab === "stock" ? "bg-[var(--color-primary)] text-white" : "border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-slate-50"
            }`}
          >
            <Package size={14} aria-hidden="true" />
            Stock & catalogue
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="Bulk import / export"
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-slate-50"
            >
              <Upload size={14} aria-hidden="true" />
              <Download size={14} aria-hidden="true" />
              <ChevronDown size={12} aria-hidden="true" className="opacity-60" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-30 mt-1.5 w-60 rounded-xl border border-[var(--color-border)] bg-white p-1.5 shadow-xl"
              >
                <div className="flex gap-1 border-b border-[var(--color-border)] pb-1.5">
                  {!viewOnly && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); setTab("import"); }}
                    title="Bulk import"
                    className="focus-ring inline-flex flex-1 items-center justify-center rounded-lg py-2 text-[var(--color-muted-fg)] transition-colors hover:bg-[var(--color-primary-soft)] hover:text-[var(--color-primary)]"
                  >
                    <Upload size={16} />
                  </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={runExport}
                    disabled={exporting}
                    title="Bulk export"
                    className="focus-ring inline-flex flex-1 items-center justify-center rounded-lg py-2 text-[var(--color-muted-fg)] transition-colors hover:bg-[var(--color-primary-soft)] hover:text-[var(--color-primary)] disabled:opacity-50"
                  >
                    <Download size={16} />
                  </button>
                </div>
                {!viewOnly && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); setTab("import"); }}
                  className={`focus-ring mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 ${tab === "import" ? "bg-[var(--color-primary-soft)] font-semibold text-[var(--color-primary)]" : "text-[var(--color-foreground)]"}`}
                >
                  <Upload size={14} aria-hidden="true" /> Bulk import
                </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={runExport}
                  disabled={exporting}
                  className="focus-ring mt-0.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--color-foreground)] transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  <Download size={14} aria-hidden="true" /> {exporting ? "Exporting…" : "Bulk export"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {tab === "stock" && <PharmacyStockView />}
      {tab === "import" && !viewOnly && <ImportTab />}

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          <CheckCircle2 size={16} className="text-emerald-400" /> {toast}
        </div>
      )}
    </div>
  );
}