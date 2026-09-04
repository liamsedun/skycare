"use client";

import { mutedXs, mutedFg, divideBorder, fgSemibold, emptyState } from "@/lib/ui-constants";
import { getTenantCurrency, useCurrency, currencySymbol } from "@/lib/currency";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, RefreshCcw, PackagePlus, ArrowLeftRight, Pill, X, AlertTriangle,
  Sparkles, CalendarX, ChevronLeft, ChevronRight, CheckCircle2, Package,
  Pencil, Archive,
} from "lucide-react";
import { DrugFormModal } from "@/components/dashboard/pharmacy-admin-view";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const btnPrimary =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60";
const btnGhost =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-slate-50 disabled:opacity-60";
const ngnv = (v: number | null | undefined, currency?: string) => {
  const n = Number(v ?? 0);
  const cur = currency || getTenantCurrency() || "NGN";
  if (cur !== "NGN") return new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n);
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);
};

interface InventoryRow {
  id: string;
  name: string;
  genericName: string | null;
  brand: string | null;
  category: string;
  form: string;
  dosage: string | null;
  unitPrice: number;
  wholesalePrice: number;
  effectivePrice: number;
  reorderLevel: number;
  reorderQty: number;
  sku: string | null;
  requiresRx: boolean;
  isControlled: boolean;
  nafdacNumber: string | null;
  isActive: boolean;
  supplierId: string | null;
  supplierName: string | null;
  stock: number;
  lowStock: boolean;
  outOfStock: boolean;
  expiredBatches: number;
  expiringBatches: number;
}

interface BranchRow { id: string; name: string; code: string | null; is_main: boolean; is_active: boolean }
interface CategoryRow { id: string; name: string; color: string | null; isPlatform: boolean }
interface DrugPick { id: string; name: string; genericName: string | null; brand: string | null }

type AlertFilter = "all" | "low" | "expiring" | "expired";

const SUBTLE = {
  ok: { chip: "bg-emerald-100 text-emerald-700" },
  low: { bg: "bg-red-50", text: "text-red-700", chip: "bg-red-100 text-red-700" },
  out: { bg: "bg-rose-50", text: "text-rose-700", chip: "bg-rose-100 text-rose-800" },
  expiring: { bg: "bg-amber-50", text: "text-amber-700", chip: "bg-amber-100 text-amber-700" },
  expired: { bg: "bg-orange-50", text: "text-orange-700", chip: "bg-orange-100 text-orange-700" },
} as const;

export default function PharmacyStockView() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [branch, setBranch] = useState(""); // "" all | "central" | uuid
  const [alertFilter, setAlertFilter] = useState<AlertFilter>("all");

  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const [detailDrugId, setDetailDrugId] = useState<string | null>(null);
  const [actModal, setActModal] = useState<null | { kind: "restock"; drugId: string } | { kind: "transfer"; drugId: string } | { kind: "dispense"; drugId: string }>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [drugModal, setDrugModal] = useState<{ open: true; drug: InventoryRow | null } | { open: false }>({ open: false });

  const pageSize = 25;
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search.trim()) params.set("q", search.trim());
      if (category) params.set("category", category);
      if (showArchived) params.set("includeInactive", "1");
      if (branch === "central") params.set("branch", "central");
      else if (branch) params.set("branch", branch);
      const res = await fetch(`/api/pharmacy/inventory?${params.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (res.ok) {
        setRows(body.data?.items ?? []);
        setTotal(body.data?.total ?? 0);
      }
    } catch { /* non-critical */ }
    finally { setLoading(false); }
  }, [page, search, category, branch, showArchived]);

  const loadMeta = useCallback(async () => {
    try {
      const [s, b, c] = await Promise.all([
        fetch("/api/pharmacy/admin/summary", { cache: "no-store" }),
        fetch("/api/pharmacy/admin/branches", { cache: "no-store" }),
        fetch("/api/pharmacy/admin/categories", { cache: "no-store" }),
      ]);
      if (s.ok) setSummary((await s.json()).data);
      if (b.ok) setBranches((await b.json()).data ?? []);
      if (c.ok) setCategories((await c.json()).data ?? []);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  const visible = useMemo(() => {
    let v = rows;
    if (alertFilter === "low") v = v.filter((r) => r.lowStock);
    if (alertFilter === "expiring") v = v.filter((r) => r.expiringBatches > 0 || r.expiredBatches > 0);
    if (alertFilter === "expired") v = v.filter((r) => r.expiredBatches > 0);
    return v;
  }, [rows, alertFilter]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const runSweep = async () => {
    const res = await fetch("/api/pharmacy/inventory/sweep", { method: "POST" });
    const body = await res.json();
    if (res.ok) showToast(`Expiry sweep complete — ${body.data?.checked ?? 0} batch(es) checked`);
    else showToast(body.error ?? "Sweep failed");
    load();
  };

  return (
    <div className="space-y-4">
      {/* Alert summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatChunk label="Active drugs" value={summary?.activeDrugs ?? "–"} icon={<Pill size={15} />} />
        <StatChunk label="Low stock" value={summary?.lowStock ?? "–"} icon={<AlertTriangle size={15} />} tone={summary && summary.lowStock > 0 ? "warn" : undefined} />
        <StatChunk label="Expiring ≤60d" value={summary?.expiringWithin60Days ?? "–"} icon={<Sparkles size={15} />} tone={summary && summary.expiringWithin60Days > 0 ? "warn" : undefined} />
        <StatChunk label="Expired batches" value={summary?.expired ?? "–"} icon={<CalendarX size={15} />} tone={summary && summary.expired > 0 ? "warn" : undefined} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white p-3">
        <div className="relative min-w-52 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search drug name / generic / brand…"
            className={`${inputCls} pl-9`}
          />
        </div>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className={`${inputCls} w-auto`}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select value={branch} onChange={(e) => { setBranch(e.target.value); setPage(1); }} className={`${inputCls} w-auto`}>
          <option value="">All branches</option>
          <option value="central">Central (shared)</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={alertFilter} onChange={(e) => setAlertFilter(e.target.value as AlertFilter)} className={`${inputCls} w-auto`}>
          <option value="all">All stock</option>
          <option value="low">Low / out</option>
          <option value="expiring">Expiring soon</option>
          <option value="expired">Expired</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted-fg)]">
          <input type="checkbox" checked={showArchived} onChange={(e) => { setShowArchived(e.target.checked); setPage(1); }} className="accent-[var(--color-primary)]" />
          Show archived
        </label>
        <button type="button" onClick={() => setDrugModal({ open: true, drug: null })} className={btnPrimary}>
          <PackagePlus size={14} /> Add drug
        </button>
        <button type="button" className={btnGhost} onClick={() => { load(); loadMeta(); }}><RefreshCcw size={14} /> Refresh</button>
        <button type="button" className={btnGhost} onClick={runSweep}><Sparkles size={14} /> Run expiry sweep</button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
              <tr>
                <th className="px-4 py-2.5">Drug</th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Form / Dosage</th>
                <th className="px-4 py-2.5">Supplier</th>
                <th className="px-4 py-2.5 text-right">Retail</th>
                <th className="px-4 py-2.5 text-right">Effective</th>
                <th className="px-4 py-2.5 text-right">Stock</th>
                <th className="px-4 py-2.5 text-right">Reorder</th>
                <th className="px-4 py-2.5">Alerts</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={divideBorder}>
              {loading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--color-muted-fg)]">Loading inventory…</td></tr>
              )}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--color-muted-fg)]">No drugs match the current filters.</td></tr>
              )}
              {!loading && visible.map((r) => (
                <StockRow
                  key={r.id}
                  row={r}
                  onOpen={() => setDetailDrugId(r.id)}
                  onRestock={() => setActModal({ kind: "restock", drugId: r.id })}
                  onTransfer={() => setActModal({ kind: "transfer", drugId: r.id })}
                  onDispense={() => setActModal({ kind: "dispense", drugId: r.id })}
                  onEdit={() => setDrugModal({ open: true, drug: r })}
                  onToggleActive={async () => {
                    await fetch(`/api/pharmacy/admin/drugs/${r.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ isActive: !r.isActive }),
                    });
                    load();
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-2.5">
          <p className={mutedXs}>Showing {visible.length} of {total} drugs — page {page}/{totalPages}</p>
          <div className="flex gap-1.5">
            <button type="button" className={btnGhost} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft size={14} /> Prev</button>
            <button type="button" className={btnGhost} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      {detailDrugId && <BatchDrawer drugId={detailDrugId} onClose={() => setDetailDrugId(null)} onRestock={() => setActModal({ kind: "restock", drugId: detailDrugId })} onToast={showToast} />}
      {actModal && (
        <OperationModal
          kind={actModal.kind}
          drugId={actModal.drugId}
          branches={branches}
          onClose={() => setActModal(null)}
          onDone={(msg) => { showToast(msg); setActModal(null); load(); loadMeta(); }}
        />
      )}
      {drugModal.open && (
        <DrugFormModal
          drug={drugModal.drug}
          categories={categories}
          onClose={() => setDrugModal({ open: false })}
          onSaved={() => { setDrugModal({ open: false }); load(); }}
        />
      )}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          <CheckCircle2 size={16} className="text-emerald-400" /> {toast}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function StatChunk({ label, value, icon, tone }: { label: string; value: number | string; icon: React.ReactNode; tone?: "warn" }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-sm)]">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone === "warn" ? "bg-amber-100 text-amber-600" : "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"}`}>
        {icon}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">{label}</p>
        <p className={`text-lg font-bold ${tone === "warn" ? "text-amber-600" : "text-[var(--color-foreground)]"}`}>{value}</p>
      </div>
    </div>
  );
}

function StockRow({ row, onOpen, onRestock, onTransfer, onDispense, onEdit, onToggleActive }: { row: InventoryRow; onOpen: () => void; onRestock: () => void; onTransfer: () => void; onDispense: () => void; onEdit: () => void; onToggleActive: () => void }) {
  const severity = row.outOfStock ? SUBTLE.out : row.lowStock ? SUBTLE.low : undefined;
  return (
    <tr className={`transition-colors duration-150 hover:bg-slate-50 ${row.isActive ? "" : "opacity-50"}`}>
      <td className="px-4 py-3">
        <button type="button" onClick={onOpen} className="focus-ring text-left">
          <span className={fgSemibold}>{row.name}</span>
          {row.brand && <span className="ml-1 text-xs text-[var(--color-muted-fg)]">({row.brand})</span>}
          {row.genericName && <span className="block text-xs text-[var(--color-muted-fg)]">{row.genericName}</span>}
          {row.isControlled && (
            <span className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold uppercase text-red-700">controlled</span>
          )}
          {!row.isActive && <span className="ml-1 rounded bg-slate-200 px-1 py-0.5 text-[9px] font-bold uppercase text-slate-600">archived</span>}
        </button>
      </td>
      <td className="px-4 py-3 text-xs text-[var(--color-muted-fg)]">{row.category}</td>
      <td className="px-4 py-3 text-xs">{row.form}{row.dosage ? ` · ${row.dosage}` : ""}</td>
      <td className="px-4 py-3">
        <span className="text-xs text-[var(--color-foreground)]">{row.supplierName ?? <span className={mutedFg}>—</span>}</span>
      </td>
      <td className="px-4 py-3 text-right">{ngnv(row.unitPrice)}</td>
      <td className="px-4 py-3 text-right">
        {row.effectivePrice !== row.unitPrice ? (
          <span className="font-semibold text-[var(--color-primary)]">{ngnv(row.effectivePrice)}</span>
        ) : (
          <span className={mutedFg}>—</span>
        )}
      </td>
      <td className={`px-4 py-3 text-right font-bold ${severity ? severity.text : "text-[var(--color-foreground)]"}`}>{row.stock}</td>
      <td className="px-4 py-3 text-right text-xs text-[var(--color-muted-fg)]">{row.reorderLevel}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {row.outOfStock && <Chip cls={SUBTLE.out.chip}>Out of stock</Chip>}
          {row.lowStock && !row.outOfStock && <Chip cls={SUBTLE.low.chip}>Low</Chip>}
          {row.expiringBatches > 0 && <Chip cls={SUBTLE.expiring.chip}>Expiring {row.expiringBatches}</Chip>}
          {row.expiredBatches > 0 && <Chip cls={SUBTLE.expired.chip}>Expired {row.expiredBatches}</Chip>}
          {!row.lowStock && row.expiringBatches === 0 && row.expiredBatches === 0 && <Chip cls="bg-emerald-100 text-emerald-700">OK</Chip>}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1.5">
          <button type="button" onClick={onEdit} className="focus-ring rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-muted-fg)] hover:bg-slate-100" title={row.isActive ? "Edit drug" : "Edit drug"}><Pencil size={15} /></button>
          <button type="button" onClick={onToggleActive} className="focus-ring rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-muted-fg)] hover:bg-slate-100" title={row.isActive ? "Archive" : "Restore"}><Archive size={15} /></button>
          <button type="button" onClick={onRestock} className="focus-ring rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-muted-fg)] hover:bg-slate-100" title="Receive stock"><PackagePlus size={15} /></button>
          <button type="button" onClick={onTransfer} className="focus-ring rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-muted-fg)] hover:bg-slate-100" title="Transfer"><ArrowLeftRight size={15} /></button>
          <button type="button" onClick={onDispense} className="focus-ring rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-muted-fg)] hover:bg-slate-100" title="Dispense"><Pill size={15} /></button>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Batch drill-down
// ---------------------------------------------------------------------------
interface BatchDetail {
  drug: { id: string; name: string; form: string | null; dosage: string | null; reorderLevel: number; reorderQty: number };
  totals: { stock: number; expiredUnits: number; dispensableStock: number };
  batches: Array<{ id: string; batchNumber: string; branchId: string | null; branchName: string | null; expiryDate: string | null; status: "ok" | "expired"; quantityOnHand: number; costPrice: number; location: string | null; receivedAt: string | null }>;
  movements: Array<{ id: string; type: string; quantity: number; branchId: string | null; sourceRef: string | null; notes: string | null; createdBy: string | null; createdAt: string }>;
}

function BatchDrawer({ drugId, onClose, onRestock, onToast }: { drugId: string; onClose: () => void; onRestock: () => void; onToast: (m: string) => void }) {
  const [data, setData] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pharmacy/inventory/${drugId}`, { cache: "no-store" });
      const body = await res.json();
      if (res.ok) setData(body.data);
    } catch { /* non-critical */ }
    finally { setLoading(false); }
  }, [drugId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onClick={onClose} role="dialog" aria-modal="true" aria-label="Batch drill-down">
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Batch drill-down</p>
            {data && (
              <h3 className="mt-0.5 text-lg font-bold text-[var(--color-foreground)]">{data.drug.name}</h3>
            )}
          </div>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-muted-fg)] hover:bg-slate-50" aria-label="Close"><X size={16} /></button>
        </div>

        {loading && <p className={emptyState}>Loading batches…</p>}

        {data && (
          <>
            <div className="mb-4 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-slate-50 p-2.5 text-center">
                <p className="text-[11px] font-semibold uppercase text-[var(--color-muted-fg)]">Stock</p>
                <p className="text-lg font-bold">{data.totals.stock}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5 text-center">
                <p className="text-[11px] font-semibold uppercase text-[var(--color-muted-fg)]">Expired</p>
                <p className={`text-lg font-bold ${data.totals.expiredUnits > 0 ? "text-orange-600" : ""}`}>{data.totals.expiredUnits}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5 text-center">
                <p className="text-[11px] font-semibold uppercase text-[var(--color-muted-fg)]">Dispensable</p>
                <p className="text-lg font-bold">{data.totals.dispensableStock}</p>
              </div>
            </div>

            <div className="mb-4 flex gap-2">
              <button type="button" className={btnPrimary} onClick={onRestock}><PackagePlus size={14} /> Receive stock</button>
            </div>

            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-muted-fg)]">Batches</h4>
            <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 uppercase tracking-wide text-[var(--color-muted-fg)]">
                  <tr>
                    <th className="px-3 py-2">Batch</th>
                    <th className="px-3 py-2">Branch</th>
                    <th className="px-3 py-2">Expiry</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className={divideBorder}>
                  {data.batches.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-[var(--color-muted-fg)]">No batches yet.</td></tr>}
                  {data.batches.map((b) => (
                    <tr key={b.id}>
                      <td className="px-3 py-2 font-medium">{b.batchNumber}</td>
                      <td className="px-3 py-2 text-[var(--color-muted-fg)]">{b.branchName ?? "Central"}</td>
                      <td className="px-3 py-2">
                        <span className={b.status === "expired" ? "font-semibold text-orange-600" : ""}>{b.expiryDate ?? "—"}</span>
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${b.quantityOnHand <= 0 ? "text-[var(--color-muted-fg)]" : ""}`}>{b.quantityOnHand}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h4 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-[var(--color-muted-fg)]">Last receipt / movements</h4>
            <div className="space-y-1.5">
              {data.movements.length === 0 && <p className={mutedXs}>No movements recorded.</p>}
              {data.movements.map((m) => (
                <p key={m.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <span>
                    <Chip cls={SUBTLE[mapType(m.type)].chip}>{m.type}</Chip>
                    {" "}<span className="font-medium">{m.quantity} units</span>
                    {m.branchId && <span className={mutedFg}> · branch {m.branchId.slice(0, 8)}</span>}
                    {m.notes && <span className="ml-1 text-[var(--color-muted-fg)]">— {m.notes}</span>}
                  </span>
                  <span className="shrink-0 text-[var(--color-muted-fg)]">{new Date(m.createdAt).toLocaleDateString()}</span>
                </p>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function mapType(t: string): keyof typeof SUBTLE {
  switch (t) {
    case "in": return "ok";
    case "dispense": return "out";
    case "transfer_out": return "low";
    case "transfer_in": return "ok";
    default: return "expiring";
  }
}

function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{children}</span>;
}

// ---------------------------------------------------------------------------
// Operation modals (restock / transfer / dispense)
// ---------------------------------------------------------------------------
function OperationModal({ kind, drugId, branches, onClose, onDone }: { kind: "restock" | "transfer" | "dispense"; drugId: string; branches: BranchRow[]; onClose: () => void; onDone: (msg: string) => void }) {
  const [batchNumber, setBatchNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [location, setLocation] = useState("");
  const [supplier, setSupplier] = useState("");
  const [branch, setBranch] = useState("central");
  const [fromBranch, setFromBranch] = useState("central");
  const [toBranch, setToBranch] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currency } = useCurrency();

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const payload: Record<string, unknown> = {};
      let url = "";
      if (kind === "restock") {
        url = "/api/pharmacy/restock";
        payload.drugId = drugId;
        payload.batchNumber = batchNumber.trim();
        payload.expiry = expiry;
        payload.quantity = Number(qty);
        payload.costPrice = Number(cost) || 0;
        payload.location = location.trim() || null;
        payload.supplierId = supplier || null;
        payload.branchId = branch === "central" ? null : branch;
      } else if (kind === "transfer") {
        url = "/api/pharmacy/transfer";
        payload.drugId = drugId;
        payload.fromBranchId = fromBranch === "central" ? null : fromBranch;
        payload.toBranchId = toBranch === "central" ? null : toBranch;
        payload.quantity = Number(qty);
        payload.notes = notes.trim() || null;
      } else {
        url = "/api/pharmacy/dispense";
        payload.drugId = drugId;
        payload.branchId = branch === "central" ? null : branch;
        payload.quantity = Number(qty);
        payload.notes = notes.trim() || null;
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Request failed");
      onDone(kind === "restock" ? "Stock received" : kind === "transfer" ? "Transfer complete" : "Dispensed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const title = kind === "restock" ? "Receive stock" : kind === "transfer" ? "Transfer stock" : "Dispense stock";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-[var(--color-foreground)]">{title}</h3>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-muted-fg)] hover:bg-slate-50" aria-label="Close"><X size={15} /></button>
        </div>

        <div className="space-y-3">
          {kind === "restock" && (
            <>
              <Field label="Batch number *"><input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} className={inputCls} placeholder="e.g. AM-2027-015" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Expiry date *"><input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={inputCls} /></Field>
                <Field label="Quantity *"><input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} placeholder="0" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Cost per unit (${currencySymbol(currency)})`}><input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} className={inputCls} placeholder="0" /></Field>
                <Field label="Location"><input value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} placeholder="Shelf A2" /></Field>
              </div>
              <Field label="Receive into branch">
                <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls}>
                  <option value="central">Central (shared)</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
            </>
          )}

          {kind === "transfer" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From">
                  <select value={fromBranch} onChange={(e) => setFromBranch(e.target.value)} className={inputCls}>
                    <option value="central">Central (shared)</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </Field>
                <Field label="To">
                  <select value={toBranch} onChange={(e) => setToBranch(e.target.value)} className={inputCls}>
                    <option value="central">Central (shared)</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Quantity *"><input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} placeholder="0" /></Field>
              <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="e.g. Reallocated for Aguda branch" /></Field>
            </>
          )}

          {kind === "dispense" && (
            <>
              <Field label="Quantity *"><input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} placeholder="0" /></Field>
              <Field label="From branch">
                <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls}>
                  <option value="central">Central (shared)</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="e.g. Ward issue / cash sale" /></Field>
            </>
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
            <button type="button" className={btnPrimary} disabled={busy} onClick={submit}>{busy ? "Working…" : kind === "restock" ? "Receive" : kind === "transfer" ? "Transfer" : "Dispense"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[var(--color-muted-fg)]">{label}</span>
      {children}
    </label>
  );
}