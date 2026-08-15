"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDownToLine, Banknote, Building2, CheckCircle2, CreditCard,
  Download, FileText, Landmark, Loader2, Package, Plus, ReceiptText, Search, Send, Wallet, X,
} from "lucide-react";
import { ngn, formatDate } from "@/lib/auth";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";
import ImportExportMenu from "@/components/ui/import-export-menu";
import FilterBar from "@/components/filters/filter-bar";
import type { ImportResult } from "@/components/ui/csv-import-modal";

// ============================================================================
// Vendor Purchasing — the money side of Suppliers & Procurement.
//   BalancesTab      bought vs paid vs outstanding per supplier
//   PurchaseOrdersTab  PO lifecycle: draft → sent → approved → received
//   PaymentsTab      instant bank transfer / cash / POS or credit-on-account
// ============================================================================

const btnPrimary =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60";
const btnGhost =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-slate-50 disabled:opacity-60";
const btnDanger =
  "focus-ring rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 transition-colors duration-200 hover:bg-rose-50 disabled:opacity-60";
const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

const PO_STATUS_STYLES: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  sent: "bg-sky-100 text-sky-700",
  approved: "bg-indigo-100 text-indigo-700",
  received: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-500",
};

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  pos: "POS",
  credit_note: "Credit note",
};

const METHOD_ICONS: Record<string, typeof Landmark> = {
  bank_transfer: Landmark,
  cash: Wallet,
  pos: CreditCard,
  credit_note: ReceiptText,
};

// ---------------------------------------------------------------------------
// BALANCES
// ---------------------------------------------------------------------------

interface SupplierBalance {
  supplierId: string;
  supplierName: string;
  code: string | null;
  totalOrdered: number;
  totalBought: number;
  totalPaid: number;
  outstanding: number;
  openingBought: number;
  openingPaid: number;
  poCount: number;
  paymentCount: number;
  lastBoughtAt: string | null;
  lastPaidAt: string | null;
}

export function BalancesTab() {
  const [rows, setRows] = useState<SupplierBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pharmacy/procurement/summary", { cache: "no-store" });
      const body = await res.json();
      if (res.ok) {
        const d = body.data ?? {};
        setRows(d.suppliers ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q || r.supplierName.toLowerCase().includes(q) || (r.code ?? "").toLowerCase().includes(q);
    const matchesDate = inDateRange(r.lastBoughtAt, from, to) || inDateRange(r.lastPaidAt, from, to);
    return matchesSearch && matchesDate;
  });

  const filteredTotals = visible.reduce(
    (acc, r) => ({
      total_bought: acc.total_bought + r.totalBought,
      total_paid: acc.total_paid + r.totalPaid,
      total_outstanding: acc.total_outstanding + r.outstanding,
    }),
    { total_bought: 0, total_paid: 0, total_outstanding: 0 }
  );

  const exportRows = () =>
    visible.map((r) => [
      r.supplierName,
      r.code ?? "",
      r.totalOrdered,
      r.totalBought,
      r.totalPaid,
      r.outstanding,
      r.openingBought,
      r.poCount,
      r.paymentCount,
    ]);

  async function importOpeningBalances(rowsIn: string[][]): Promise<ImportResult> {
    const rows = rowsIn.map((r, i) => ({
      row: i + 2,
      supplierName: String(r[0] ?? "").trim(),
      totalBought: String(r[1] ?? "").trim(),
      totalPaid: String(r[2] ?? "").trim(),
      notes: String(r[3] ?? "").trim() || undefined,
    }));
    try {
      const res = await fetch("/api/pharmacy/procurement/balances/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const body = await res.json();
      if (!res.ok) return { created: 0, failed: rows.length, errors: [body.error ?? "Import failed"] };
      const d = body.data ?? {};
      return {
        created: d.imported ?? 0,
        failed: (d.errors ?? []).length,
        errors: (d.errors ?? []).map((e: { row: number; message: string }) => `Row ${e.row}: ${e.message}`),
        notes: d.imported > 0 ? [`Opening balance saved for ${d.imported} supplier(s)`] : [],
      };
    } catch (e) {
      return { created: 0, failed: rows.length, errors: [e instanceof Error ? e.message : "Import failed"] };
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
          <p className="text-xs font-medium text-[var(--color-muted-fg)]">Total bought from suppliers</p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-foreground)]">{ngn(filteredTotals.total_bought)}</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
          <p className="text-xs font-medium text-[var(--color-muted-fg)]">Total paid</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{ngn(filteredTotals.total_paid)}</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
          <p className="text-xs font-medium text-[var(--color-muted-fg)]">Outstanding owing</p>
          <p className={`mt-1 text-2xl font-bold ${filteredTotals.total_outstanding > 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {ngn(filteredTotals.total_outstanding)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar
          query={search}
          onQueryChange={setSearch}
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          onClear={() => { setSearch(""); setFrom(""); setTo(""); }}
          searchPlaceholder="Search supplier or code…"
          searchWidth={240}
        />
        <ImportExportMenu
          entityLabel="supplier balances"
          exportCsv={() => {
            if (visible.length === 0) { alert("Nothing to export yet."); return; }
            downloadCsv(`supplier-balances-${dateStamp()}.csv`,
              ["Supplier", "Code", "Total ordered", "Total bought", "Total paid", "Outstanding", "Opening bought", "POs", "Payments"],
              exportRows());
          }}
          exportPdf={() => {
            if (visible.length === 0) { alert("Nothing to export yet."); return; }
            printTable("Supplier Balances",
              ["Supplier", "Code", "Total ordered", "Total bought", "Total paid", "Outstanding", "Opening bought", "POs", "Payments"],
              exportRows());
          }}
          importTitle="Import opening balances"
          importDescription="Use this when migrating from another system or a spreadsheet — enter what you have bought from and paid to each supplier so far. Names match your supplier list (add any missing ones on the Suppliers tab first); re-importing overwrites an existing opening balance. Purchases and payments recorded in SkyCare keep adding on top."
          importColumns={["supplier_name", "total_bought", "total_paid", "notes"]}
          importSample={[
            ["Emzor Pharmaceutical Industries Limited", "2500000", "1800000", "Opening balance from previous system"],
          ]}
          templateFilename="supplier-opening-balances-template.csv"
          onImport={importOpeningBalances}
          onImported={() => void load()}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-[var(--color-primary)]" aria-hidden="true" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-14 text-center shadow-[var(--shadow-sm)]">
          <Building2 size={36} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">No supplier activity yet.</p>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
            Balances appear once goods are received from suppliers or payments are recorded.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/50 text-[10px] uppercase tracking-wider text-[var(--color-muted-fg)]">
                <th className="px-4 py-2.5 font-semibold">Supplier</th>
                <th className="px-4 py-2.5 font-semibold">Total bought</th>
                <th className="px-4 py-2.5 font-semibold">Total paid</th>
                <th className="px-4 py-2.5 font-semibold">Outstanding</th>
                <th className="px-4 py-2.5 font-semibold">POs</th>
                <th className="px-4 py-2.5 font-semibold">Payments</th>
                <th className="px-4 py-2.5 font-semibold">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.supplierId} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-muted)]/30">
                  <td className="px-4 py-3 font-medium text-[var(--color-foreground)]">
                    {r.supplierName}
                    {r.openingBought > 0 && (
                      <p className="text-[10px] font-normal text-amber-600">
                        +{ngn(r.openingBought)} opening balance
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">{ngn(r.totalBought)}</td>
                  <td className="px-4 py-3 text-emerald-700">{ngn(r.totalPaid)}</td>
                  <td className={`px-4 py-3 font-semibold ${r.outstanding > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {ngn(r.outstanding)}{r.outstanding < 0 ? " (credit)" : ""}
                  </td>
                  <td className="px-4 py-3">{r.poCount}</td>
                  <td className="px-4 py-3">{r.paymentCount}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted-fg)]">
                    {r.lastBoughtAt ? `Bought ${formatDate(r.lastBoughtAt)}` : ""}
                    {r.lastPaidAt ? `${r.lastBoughtAt ? " · " : ""}Paid ${formatDate(r.lastPaidAt)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PURCHASE ORDERS
// ---------------------------------------------------------------------------

interface PoItem {
  id: string;
  drugId: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  receivedCost: number;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: string;
  totalCost: number;
  notes: string | null;
  expectedBy: string | null;
  approvedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  items: PoItem[];
}

interface SupplierOption { id: string; name: string }

interface OfferOption {
  drugId: string;
  drugName: string;
  unit: string | null;
  unitCost: number;
  minOrderQuantity: number;
  isPreferred: boolean;
}

interface DrugOption {
  id: string;
  name: string;
  unit: string | null;
  supplierId: string | null;
}

interface PoDetailItem {
  id: string;
  drugName: string;
  unit: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  receivedCost: number;
}

interface GrnSummary {
  grnNumber: string;
  receivedAt: string;
  items: Array<{ drugName: string; quantityReceived: number; unitCost: number; batchNumber: string; expiryDate: string | null }>;
}

interface PoDetail {
  id: string;
  poNumber: string;
  supplier: { name: string } | null;
  status: string;
  totalCost: number;
  notes: string | null;
  expectedBy: string | null;
  items: PoDetailItem[];
  grns: GrnSummary[];
}

const blockedImport = (msg: string) => async (): Promise<ImportResult> => ({
  created: 0,
  failed: 0,
  errors: [msg],
});

export function PurchaseOrdersTab() {
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [receivePo, setReceivePo] = useState<PurchaseOrder | null>(null);
  const [detailPo, setDetailPo] = useState<PoDetail | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [importSupplierId, setImportSupplierId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/pharmacy/procurement/purchase-orders?${params.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load purchase orders");
      setRows((body.data ?? []) as PurchaseOrder[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await fetch("/api/pharmacy/admin/suppliers", { cache: "no-store" });
      const body = await res.json();
      setSuppliers(((body.data ?? []) as Array<{ id: string; name: string }>).map((s) => ({ id: s.id, name: s.name })));
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => { void loadSuppliers(); }, [loadSuppliers]);

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }

  async function transition(po: PurchaseOrder, status: string) {
    if (status === "cancelled" && !confirm(`Cancel ${po.poNumber}?`)) return;
    setBusyId(po.id);
    setError(null);
    try {
      const res = await fetch(`/api/pharmacy/procurement/purchase-orders/${po.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update purchase order");
      await load();
      showToast("success", `${po.poNumber} marked ${status}`);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Failed to update purchase order");
    } finally {
      setBusyId(null);
    }
  }

  async function openDetail(po: PurchaseOrder) {
    setError(null);
    try {
      const res = await fetch(`/api/pharmacy/procurement/purchase-orders/${po.id}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load purchase order");
      setDetailPo(body.data ?? null);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Failed to load purchase order");
    }
  }

  const exportRows = () =>
    rows.map((po) => [
      po.poNumber,
      po.supplierName,
      po.status,
      po.totalCost,
      po.items.reduce((a, i) => a + i.quantityOrdered, 0),
      po.items.reduce((a, i) => a + i.quantityReceived, 0),
      po.expectedBy ?? "",
      po.createdAt.slice(0, 10),
    ]);

  const remaining = (po: PurchaseOrder) =>
    po.items.some((i) => i.quantityReceived < i.quantityOrdered);

  async function importPoLines(rowsIn: string[][]): Promise<ImportResult> {
    if (!importSupplierId) {
      return { created: 0, failed: rowsIn.length, errors: ["Select a supplier for this order — the picker sits above the file field."] };
    }
    const parsed = rowsIn.map((r, i) => ({
      row: i + 2,
      drugName: String(r[0] ?? "").trim(),
      quantity: Number(String(r[1] ?? "").trim()),
      unitCost: Number(String(r[2] ?? "").trim()),
    }));
    try {
      const res = await fetch("/api/pharmacy/procurement/purchase-orders/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId: importSupplierId, rows: parsed }),
      });
      const body = await res.json();
      if (!res.ok) {
        return { created: 0, failed: rowsIn.length, errors: [body.error ?? "Import failed"] };
      }
      const d = body.data ?? {};
      return {
        created: d.rowsCreated ?? 0,
        failed: (d.errors ?? []).length,
        errors: (d.errors ?? []).map((e: { row: number; message: string }) => `Row ${e.row}: ${e.message}`),
        notes: d.supplierName ? [`PO created for ${d.supplierName}`] : [],
      };
    } catch (e) {
      return { created: 0, failed: rowsIn.length, errors: [e instanceof Error ? e.message : "Import failed"] };
    }
  }

  const visible = rows.filter((po) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q || po.poNumber.toLowerCase().includes(q) || po.supplierName.toLowerCase().includes(q);
    return matchesSearch && inDateRange(po.createdAt, from, to);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterBar
            query={search}
            onQueryChange={setSearch}
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
            onClear={() => { setSearch(""); setFrom(""); setTo(""); }}
            searchPlaceholder="Search PO number or supplier…"
            searchWidth={230}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="focus-ring h-9 rounded-lg border border-[var(--color-border)] bg-white px-2 text-sm outline-none"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="approved">Approved</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <ImportExportMenu
            entityLabel="purchase orders"
            exportCsv={() => {
              if (rows.length === 0) { alert("Nothing to export yet."); return; }
              downloadCsv(`purchase-orders-${dateStamp()}.csv`,
                ["PO number", "Supplier", "Status", "Total cost", "Units ordered", "Units received", "Expected by", "Created"],
                exportRows());
            }}
            exportPdf={() => {
              if (rows.length === 0) { alert("Nothing to export yet."); return; }
              printTable("Purchase Orders",
                ["PO number", "Supplier", "Status", "Total cost", "Units ordered", "Units received", "Expected by", "Created"],
                exportRows());
            }}
            importTitle="Import purchase order lines"
            importDescription="Pick the supplier, then import a CSV of drug lines. Drug names are matched against the catalogue; unknown names are reported per row and the rest still import as one draft order."
            importColumns={["drug_name", "quantity", "unit_cost"]}
            importSample={[["Accord Levothyroxine 50mcg x28", "500", "3500"], ["Amoxicillin 500mg Capsules x20", "1000", "2200"]]}
            templateFilename="purchase-order-lines-template.csv"
            importExtra={
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-foreground)]">Supplier for this order</label>
                <select
                  value={importSupplierId}
                  onChange={(e) => setImportSupplierId(e.target.value)}
                  className={inputCls}
                  aria-label="Supplier for imported order"
                >
                  <option value="">Select supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            }
            onImport={importPoLines}
            onImported={() => void load()}
          />
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} className={btnPrimary}>
          <Plus size={14} aria-hidden="true" /> New order
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-[var(--color-primary)]" aria-hidden="true" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-14 text-center shadow-[var(--shadow-sm)]">
          <Package size={36} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">No purchase orders found.</p>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Order drugs from your suppliers — choose instant payment or credit.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((po) => {
            const busy = busyId === po.id;
            const statusStyle = PO_STATUS_STYLES[po.status] ?? "bg-slate-100 text-slate-600";
            return (
              <div key={po.id} className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--color-foreground)]">{po.poNumber}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusStyle}`}>
                        {po.status}
                      </span>
                      {remaining(po) && po.status === "approved" && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          <AlertTriangle size={11} aria-hidden="true" /> Partially received
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted-fg)]">
                      <span className="flex items-center gap-1"><Building2 size={13} aria-hidden="true" /> {po.supplierName}</span>
                      <span>{po.items.length} drug line(s) · {po.items.reduce((a, i) => a + i.quantityOrdered, 0)} units</span>
                      {po.expectedBy && <span>Expected {formatDate(po.expectedBy)}</span>}
                      <span className="font-semibold text-[var(--color-foreground)]">{ngn(po.totalCost)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {po.status === "draft" && (
                      <>
                        <button type="button" disabled={busy} onClick={() => transition(po, "sent")} className={btnGhost}>
                          <Send size={13} aria-hidden="true" /> Send to supplier
                        </button>
                        <button type="button" disabled={busy} onClick={() => transition(po, "cancelled")} className={btnDanger}>Cancel</button>
                      </>
                    )}
                    {po.status === "sent" && (
                      <>
                        <button type="button" disabled={busy} onClick={() => transition(po, "approved")} className={btnPrimary}>
                          <CheckCircle2 size={13} aria-hidden="true" /> Approve
                        </button>
                        <button type="button" disabled={busy} onClick={() => transition(po, "cancelled")} className={btnDanger}>Cancel</button>
                      </>
                    )}
                    {po.status === "approved" && (
                      <button type="button" disabled={busy} onClick={() => setReceivePo(po)} className={btnPrimary}>
                        <ArrowDownToLine size={13} aria-hidden="true" /> Receive goods
                      </button>
                    )}
                    <button type="button" disabled={busy} onClick={() => openDetail(po)} className={btnGhost}>
                      <FileText size={13} aria-hidden="true" /> View
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {createOpen && (
        <CreateOrderModal
          suppliers={suppliers}
          onClose={() => setCreateOpen(false)}
          onCreated={async () => { setCreateOpen(false); await load(); showToast("success", "Purchase order created (draft)"); }}
        />
      )}

      {receivePo && (
        <ReceiveGoodsModal
          po={receivePo}
          onClose={() => setReceivePo(null)}
          onReceived={async () => { setReceivePo(null); await load(); showToast("success", "Goods received — stock updated"); }}
        />
      )}

      {detailPo && <PoDetailModal detail={detailPo} onClose={() => setDetailPo(null)} />}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 rounded-xl border px-4 py-3 text-sm font-medium shadow-2xl ${
            toast.type === "success" ? "border-emerald-500/30 bg-emerald-50 text-emerald-700" : "border-rose-500/30 bg-rose-50 text-rose-700"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

function CreateOrderModal({
  suppliers,
  onClose,
  onCreated,
}: {
  suppliers: SupplierOption[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [drugs, setDrugs] = useState<DrugOption[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [cost, setCost] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [expectedBy, setExpectedBy] = useState("");
  const [drugSearch, setDrugSearch] = useState("");
  const [onlySupplierD, setOnlySupplierD] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDrugs = useCallback(async () => {
    try {
      const res = await fetch("/api/pharmacy/drugs", { cache: "no-store" });
      const body = await res.json();
      setDrugs(
        res.ok
          ? (body.data ?? []).map((d: { id: string; name: string; form: string | null; supplierId: string | null }) => ({
              id: d.id,
              name: d.name,
              unit: d.form || null,
              supplierId: d.supplierId ?? null,
            }))
          : []
      );
    } catch {
      setDrugs([]);
    }
  }, []);

  useEffect(() => {
    void loadDrugs();
  }, [loadDrugs]);

  const drugOptions = useMemo(() => {
    const map = new Map<string, DrugOption>();
    for (const d of drugs) map.set(d.id, d);
    for (const o of offers) if (!map.has(o.drugId)) map.set(o.drugId, { id: o.drugId, name: o.drugName, unit: o.unit, supplierId: null });
    return Array.from(map.values());
  }, [drugs, offers]);

  const supplierDrugIds = useMemo(() => {
    const ids = new Set<string>();
    for (const o of offers) ids.add(o.drugId);
    for (const d of drugs) if (d.supplierId && d.supplierId === supplierId) ids.add(d.id);
    return ids;
  }, [offers, drugs, supplierId]);

  const visibleDrugs = useMemo(() => {
    const q = drugSearch.trim().toLowerCase();
    let list = drugOptions;
    if (onlySupplierD) list = list.filter((d) => supplierDrugIds.has(d.id));
    if (q) list = list.filter((d) => d.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      const ap = supplierDrugIds.has(a.id) ? 0 : 1;
      const bp = supplierDrugIds.has(b.id) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.name.localeCompare(b.name);
    });
  }, [drugOptions, supplierDrugIds, onlySupplierD, drugSearch]);

  const loadOffers = useCallback(async (sid: string) => {
    if (!sid) { setOffers([]); return; }
    try {
      const res = await fetch(`/api/pharmacy/procurement/supplier-offers?supplier_id=${sid}`, { cache: "no-store" });
      const body = await res.json();
      const list = res.ok ? (body.data ?? []) : [];
      setOffers(list);
      setCost((prev) => {
        const next = { ...prev };
        for (const o of list) if (!next[o.drugId]) next[o.drugId] = String(o.unitCost);
        return next;
      });
    } catch {
      setOffers([]);
    }
  }, []);

  function pickSupplier(sid: string) {
    setSupplierId(sid);
    setOnlySupplierD(false);
    void loadOffers(sid);
  }

  const choseCount = Object.keys(qty).filter((id) => Number(qty[id]) > 0).length;
  const total = drugOptions.reduce(
    (sum, d) => sum + (Number(qty[d.id]) || 0) * (Number(cost[d.id]) || 0),
    0
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const items = drugOptions
        .filter((d) => Number(qty[d.id]) > 0)
        .map((d) => ({
          drugId: d.id,
          quantity: Number(qty[d.id]),
          unitCost: Number(cost[d.id]) || 0,
        }));
      if (items.length === 0) throw new Error("Enter a quantity for at least one drug");
      const res = await fetch("/api/pharmacy/procurement/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId, items, notes: notes || undefined, expectedBy: expectedBy || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create purchase order");
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create purchase order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="New purchase order" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="po-supplier">Supplier</label>
          <select id="po-supplier" required value={supplierId} onChange={(e) => pickSupplier(e.target.value)} className={inputCls}>
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {supplierId && offers.length === 0 && (
            <p className="mt-1 text-xs text-[var(--color-muted-fg)]">
              No pricing offers on file for this supplier — enter unit costs manually.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={labelCls + " mb-0"}>
              Drug lines {choseCount > 0 && <span className="text-xs font-medium text-[var(--color-muted-fg)]">· {choseCount} chosen</span>}
            </p>
            {supplierId && (
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted-fg)]">
                <input
                  type="checkbox"
                  checked={onlySupplierD}
                  onChange={(e) => setOnlySupplierD(e.target.checked)}
                  className="accent-[var(--color-primary)]"
                />
                Only {suppliers.find((s) => s.id === supplierId)?.name ?? "this supplier"}’s drugs
              </label>
            )}
          </div>

          {drugOptions.length > 0 && (
            <div className="relative">
              <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
              <input
                value={drugSearch}
                onChange={(e) => setDrugSearch(e.target.value)}
                placeholder="Search the catalogue…"
                className={inputCls + " pl-9"}
                aria-label="Search drugs"
              />
            </div>
          )}

          {drugOptions.length === 0 ? (
            <p className="rounded-lg border border-[var(--color-border)] px-3 py-4 text-sm text-[var(--color-muted-fg)]">
              No drugs in the catalog yet — add drugs from the pharmacy inventory first.
            </p>
          ) : visibleDrugs.length === 0 ? (
            <p className="rounded-lg border border-[var(--color-border)] px-3 py-4 text-sm text-[var(--color-muted-fg)]">
              {onlySupplierD && supplierDrugIds.size === 0 ? (
                <>
                  No drugs are linked to <span className="font-semibold">{suppliers.find((s) => s.id === supplierId)?.name ?? "this supplier"}</span> yet — link drugs to it in Pharmacy → Inventory (the Supplier column) or in the drug CSV import, and they will pin to the top here. For now, turn this toggle off to pick from the full catalogue.
                </>
              ) : (
                "No drugs match this search."
              )}
            </p>
          ) : (
            <>
              <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-[var(--color-border)]">
                <div className="grid grid-cols-12 gap-2 border-b border-[var(--color-border)] bg-[var(--color-muted)]/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
                  <span className="col-span-6">Drug</span>
                  <span className="col-span-3">Qty</span>
                  <span className="col-span-3 text-right">Unit cost (₦)</span>
                </div>
                {visibleDrugs.map((d) => {
                  const offer = offers.find((o) => o.drugId === d.id);
                  const pinned = supplierDrugIds.has(d.id);
                  return (
                    <div key={d.id} className={`grid grid-cols-12 items-center gap-2 border-b border-[var(--color-border)] px-3 py-2 last:border-b-0 ${Number(qty[d.id]) > 0 ? "bg-[var(--color-primary-soft)]/50" : ""}`}>
                      <div className="col-span-6 min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--color-foreground)]" title={d.name}>
                          {d.name}{d.unit ? ` (${d.unit})` : ""}
                          {offer?.isPreferred ? <span className="ml-1 text-amber-500" title="Preferred supplier">★</span> : null}
                        </p>
                        {pinned && !offer && (
                          <p className="text-[10px] text-[var(--color-muted-fg)]">Tagged to this supplier</p>
                        )}
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number" min={1} step={1} placeholder="0"
                          value={qty[d.id] ?? ""}
                          onChange={(e) => setQty((prev) => ({ ...prev, [d.id]: e.target.value }))}
                          className={inputCls + " px-2 py-1.5"}
                          aria-label={`Quantity for ${d.name}`}
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number" min={0} step="0.01" placeholder="0.00"
                          value={cost[d.id] ?? ""}
                          onChange={(e) => setCost((prev) => ({ ...prev, [d.id]: e.target.value }))}
                          className={inputCls + " px-2 py-1.5 text-right"}
                          aria-label={`Unit cost for ${d.name}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {supplierId && supplierDrugIds.size === 0 && (
                <p className="text-xs text-[var(--color-muted-fg)]">
                  None of your catalog drugs are tagged to this supplier yet — tag them in Pharmacy → Admin → Drugs so they pin to the top here. You can still order any drug manually.
                </p>
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="po-expected">Expected by (optional)</label>
            <input id="po-expected" type="date" value={expectedBy} onChange={(e) => setExpectedBy(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Order total</label>
            <p className="rounded-lg bg-[var(--color-muted)]/60 px-3 py-2 text-base font-bold text-[var(--color-foreground)]">
              {ngn(total)}
            </p>
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="po-notes">Notes</label>
          <textarea id="po-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Delivery instructions, payment terms…" />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={busy || !supplierId} className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60">
            {busy ? "Creating…" : "Create order (draft)"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ReceiveGoodsModal({
  po,
  onClose,
  onReceived,
}: {
  po: PurchaseOrder;
  onClose: () => void;
  onReceived: () => Promise<void>;
}) {
  const pendingItems = po.items.filter((i) => (i.quantityOrdered ?? 0) - (i.quantityReceived ?? 0) > 0);
  const [lines, setLines] = useState(
    pendingItems.map((i) => ({
      key: i.id,
      poItemId: i.id,
      quantityReceived: String(Math.max(0, i.quantityOrdered - i.quantityReceived)),
      batchNumber: "",
      expiryDate: "",
      actualCost: String(i.unitCost),
      drugName: i.drugId,
    }))
  );
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const items = lines
        .filter((l) => Number(l.quantityReceived) > 0)
        .map((l) => ({
          poItemId: l.poItemId,
          quantityReceived: Number(l.quantityReceived),
          batchNumber: l.batchNumber,
          expiryDate: l.expiryDate || undefined,
          actualCost: l.actualCost ? Number(l.actualCost) : undefined,
        }));
      if (items.length === 0) throw new Error("At least one line must have a received quantity");
      const res = await fetch(`/api/pharmacy/procurement/purchase-orders/${po.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, notes: notes || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to receive goods");
      await onReceived();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to receive goods");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={`Receive goods — ${po.poNumber}`} onClose={onClose}>
      <p className="mb-4 text-xs text-[var(--color-muted-fg)]">
        Receiving creates a goods received note (GRN), adds stock batches and updates inventory.
      </p>
      {po.items.length - lines.length > 0 && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          {po.items.length - lines.length} of {po.items.length} line(s) already received — showing only the {lines.length} line(s) still pending.
        </p>
      )}
      {lines.length === 0 && (
        <p className="rounded-lg border border-[var(--color-border)] px-3 py-4 text-sm text-[var(--color-muted-fg)]">
          All lines on this purchase order have been fully received.
        </p>
      )}
      <form onSubmit={submit} className="space-y-4">
        {lines.map((line) => {
          const item = po.items.find((i) => i.id === line.poItemId);
          const shortfall = (item?.quantityOrdered ?? 0) - (item?.quantityReceived ?? 0);
          return (
            <div key={line.key} className="rounded-lg border border-[var(--color-border)] p-3">
              <p className="text-sm font-medium text-[var(--color-foreground)]">
                Line · up to {shortfall} remaining
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <label className={labelCls}>Qty received</label>
                  <input type="number" min={0} max={shortfall} step={1} required value={line.quantityReceived}
                    onChange={(e) => setLines((prev) => prev.map((l) => l.key === line.key ? { ...l, quantityReceived: e.target.value } : l))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Batch number</label>
                  <input type="text" required value={line.batchNumber} placeholder="e.g. LOT-2026-01"
                    onChange={(e) => setLines((prev) => prev.map((l) => l.key === line.key ? { ...l, batchNumber: e.target.value } : l))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Expiry date</label>
                  <input type="date" value={line.expiryDate}
                    onChange={(e) => setLines((prev) => prev.map((l) => l.key === line.key ? { ...l, expiryDate: e.target.value } : l))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Actual unit cost</label>
                  <input type="number" min={0} step="0.01" value={line.actualCost}
                    onChange={(e) => setLines((prev) => prev.map((l) => l.key === line.key ? { ...l, actualCost: e.target.value } : l))}
                    className={inputCls} />
                </div>
              </div>
            </div>
          );
        })}

        <div>
          <label className={labelCls} htmlFor="grn-notes">Notes</label>
          <textarea id="grn-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Delivery note reference…" />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={busy || lines.length === 0} className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60">
            {busy ? "Receiving…" : "Receive goods"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function PoDetailModal({ detail, onClose }: { detail: PoDetail; onClose: () => void }) {
  return (
    <ModalShell title={`${detail.poNumber} — ${detail.supplier?.name ?? "Supplier"}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted-fg)]">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PO_STATUS_STYLES[detail.status] ?? ""}`}>
            {detail.status}
          </span>
          <span>Total: <strong className="text-[var(--color-foreground)]">{ngn(detail.totalCost)}</strong></span>
          {detail.expectedBy && <span>Expected {formatDate(detail.expectedBy)}</span>}
        </div>

        <div>
          <p className={labelCls}>Items</p>
          <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/50 uppercase tracking-wider text-[var(--color-muted-fg)]">
                  <th className="px-3 py-2">Drug</th>
                  <th className="px-3 py-2">Ordered</th>
                  <th className="px-3 py-2">Received</th>
                  <th className="px-3 py-2">Unit cost</th>
                  <th className="px-3 py-2">Line total</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((i) => (
                  <tr key={i.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-2 font-medium text-[var(--color-foreground)]">{i.drugName}</td>
                    <td className="px-3 py-2">{i.quantityOrdered}</td>
                    <td className="px-3 py-2">{i.quantityReceived}</td>
                    <td className="px-3 py-2">{ngn(i.unitCost)}</td>
                    <td className="px-3 py-2">{ngn(i.quantityReceived * i.unitCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {detail.grns.length > 0 && (
          <div>
            <p className={labelCls}>Goods received ({detail.grns.length})</p>
            <div className="space-y-2">
              {detail.grns.map((g) => (
                <div key={g.grnNumber} className="rounded-lg border border-[var(--color-border)] p-3">
                  <p className="text-xs font-semibold text-[var(--color-foreground)]">
                    {g.grnNumber} · {formatDate(g.receivedAt)}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs text-[var(--color-muted-fg)]">
                    {g.items.map((gi, idx) => (
                      <li key={idx}>
                        {gi.drugName} × {gi.quantityReceived} @ {ngn(gi.unitCost)} — batch {gi.batchNumber}
                        {gi.expiryDate ? ` (exp ${gi.expiryDate})` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// PAYMENTS
// ---------------------------------------------------------------------------

interface PaymentRow {
  id: string;
  supplierId: string;
  supplierName: string;
  poId: string | null;
  poNumber: string | null;
  amount: number;
  method: string;
  bankLabel: string | null;
  reference: string | null;
  notes: string | null;
  paidAt: string;
  createdByName: string | null;
}

export function PaymentsTab() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [balances, setBalances] = useState<SupplierBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplierFilter, setSupplierFilter] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (supplierFilter) params.set("supplier_id", supplierFilter);
      const res = await fetch(`/api/pharmacy/procurement/supplier-payments?${params.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load payments");
      setRows((body.data ?? []) as PaymentRow[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, [supplierFilter]);

  useEffect(() => { void load(); }, [load]);

  const loadOptions = useCallback(async () => {
    try {
      const [suppliersRes, summaryRes] = await Promise.all([
        fetch("/api/pharmacy/admin/suppliers", { cache: "no-store" }),
        fetch("/api/pharmacy/procurement/summary", { cache: "no-store" }),
      ]);
      const suppliersBody = await suppliersRes.json();
      const summaryBody = await summaryRes.json();
      setSuppliers(((suppliersBody.data ?? []) as Array<{ id: string; name: string }>).map((s) => ({ id: s.id, name: s.name })));
      setBalances(((summaryBody.data?.suppliers ?? []) as SupplierBalance[]));
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => { void loadOptions(); }, [loadOptions]);

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }

  const outstandingFor = (supplierId: string) => {
    const b = balances.find((x) => x.supplierId === supplierId);
    return b ? b.outstanding : null;
  };

  const exportRows = () =>
    rows.map((p) => [
      p.paidAt,
      p.supplierName,
      p.poNumber ?? "",
      METHOD_LABELS[p.method] ?? p.method,
      p.amount,
      p.bankLabel ?? "",
      p.reference ?? "",
      p.createdByName ?? "",
    ]);

  const visible = rows.filter((p) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      p.supplierName.toLowerCase().includes(q) ||
      (p.poNumber ?? "").toLowerCase().includes(q) ||
      (p.reference ?? "").toLowerCase().includes(q);
    return matchesSearch && inDateRange(p.paidAt, from, to);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterBar
            query={search}
            onQueryChange={setSearch}
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
            onClear={() => { setSearch(""); setFrom(""); setTo(""); }}
            searchPlaceholder="Search supplier, PO or reference…"
            searchWidth={230}
          />
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="focus-ring h-9 rounded-lg border border-[var(--color-border)] bg-white px-2 text-sm outline-none"
            aria-label="Filter by supplier"
          >
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <ImportExportMenu
            entityLabel="supplier payments"
            exportCsv={() => {
              if (rows.length === 0) { alert("Nothing to export yet."); return; }
              downloadCsv(`supplier-payments-${dateStamp()}.csv`,
                ["Date", "Supplier", "PO", "Method", "Amount", "Bank account", "Reference", "Recorded by"],
                exportRows());
            }}
            exportPdf={() => {
              if (rows.length === 0) { alert("Nothing to export yet."); return; }
              printTable("Supplier Payments",
                ["Date", "Supplier", "PO", "Method", "Amount", "Bank account", "Reference", "Recorded by"],
                exportRows());
            }}
            importTitle="Import supplier payments"
            importDescription="Payments are recorded through the Record payment flow so the bank ledger stays in sync."
            importColumns={["supplier"]}
            templateFilename="supplier-payments-template.csv"
            onImport={blockedImport("Payments must be recorded through the Record payment flow — import is not available.")}
          />
        </div>
        <button type="button" onClick={() => setOpen(true)} className={btnPrimary}>
          <Plus size={14} aria-hidden="true" /> Record payment
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-[var(--color-primary)]" aria-hidden="true" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-14 text-center shadow-[var(--shadow-sm)]">
          <Wallet size={36} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">No payments recorded.</p>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Pay by instant bank transfer, cash or POS — or buy on credit and settle later.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/50 text-[10px] uppercase tracking-wider text-[var(--color-muted-fg)]">
                <th className="px-4 py-2.5 font-semibold">Date</th>
                <th className="px-4 py-2.5 font-semibold">Supplier</th>
                <th className="px-4 py-2.5 font-semibold">PO</th>
                <th className="px-4 py-2.5 font-semibold">Method</th>
                <th className="px-4 py-2.5 font-semibold">Amount</th>
                <th className="px-4 py-2.5 font-semibold">Reference</th>
                <th className="px-4 py-2.5 font-semibold">Recorded by</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const Icon = METHOD_ICONS[p.method] ?? Wallet;
                return (
                  <tr key={p.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-muted)]/30">
                    <td className="px-4 py-3 whitespace-nowrap">{p.paidAt}</td>
                    <td className="px-4 py-3 font-medium text-[var(--color-foreground)]">{p.supplierName}</td>
                    <td className="px-4 py-3 text-xs">{p.poNumber ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-muted)]/60 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-muted-fg)]">
                        <Icon size={11} aria-hidden="true" /> {METHOD_LABELS[p.method] ?? p.method}
                      </span>
                      {p.bankLabel && <span className="ml-1.5 block text-[10px] text-[var(--color-muted-fg)]">{p.bankLabel}</span>}
                    </td>
                    <td className={`px-4 py-3 font-semibold ${p.method === "credit_note" ? "text-sky-700" : "text-rose-600"}`}>
                      {p.method === "credit_note" ? "−" : ""}{ngn(p.amount)}
                    </td>
                    <td className="px-4 py-3 text-xs">{p.reference ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-[var(--color-muted-fg)]">{p.createdByName ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <RecordPaymentModal
          suppliers={suppliers}
          outstandingFor={outstandingFor}
          onClose={() => setOpen(false)}
          onRecorded={async () => { setOpen(false); await Promise.all([load(), loadOptions()]); showToast("success", "Payment recorded"); }}
        />
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 rounded-xl border px-4 py-3 text-sm font-medium shadow-2xl ${
            toast.type === "success" ? "border-emerald-500/30 bg-emerald-50 text-emerald-700" : "border-rose-500/30 bg-rose-50 text-rose-700"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

function RecordPaymentModal({
  suppliers,
  outstandingFor,
  onClose,
  onRecorded,
}: {
  suppliers: SupplierOption[];
  outstandingFor: (supplierId: string) => number | null;
  onClose: () => void;
  onRecorded: () => Promise<void>;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [poId, setPoId] = useState("");
  const [pos, setPos] = useState<Array<{ id: string; poNumber: string; status: string; totalCost: number }>>([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [bankAccountId, setBankAccountId] = useState("");
  const [bankAccounts, setBankAccounts] = useState<Array<{ account_id: string | null; label: string; bank_name: string | null }>>([]);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickSupplier(sid: string) {
    setSupplierId(sid);
    setPoId("");
    try {
      const res = await fetch(`/api/pharmacy/procurement/purchase-orders?pageSize=100&supplier_id=${sid}`, { cache: "no-store" });
      const body = await res.json();
      const all = ((body.data ?? []) as Array<{ id: string; poNumber: string; status: string; totalCost: number }>);
      setPos(all.filter((p) => p.status === "sent" || p.status === "approved" || p.status === "received"));
    } catch {
      setPos([]);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/banking", { cache: "no-store" });
        const body = await res.json();
        if (res.ok) {
          setBankAccounts(((body.accounts ?? []) as Array<{ account_id: string | null; label: string; bank_name: string | null }>)
            .filter((a) => a.bank_name));
        }
      } catch { /* non-critical */ }
    })();
  }, []);

  const outstanding = supplierId ? outstandingFor(supplierId) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        supplierId,
        poId: poId || undefined,
        amount: Number(amount),
        method,
        bankAccountId: bankAccountId || undefined,
        reference: reference || undefined,
        notes: notes || undefined,
        paidAt: paidAt || undefined,
      };
      const res = await fetch("/api/pharmacy/procurement/supplier-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const resBody = await res.json();
      if (!res.ok) throw new Error(resBody.error ?? "Failed to record payment");
      await onRecorded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record payment");
    } finally {
      setBusy(false);
    }
  }

  const showBankPicker = method === "bank_transfer" || method === "pos";

  return (
    <ModalShell title="Record supplier payment" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="pay-supplier">Supplier</label>
          <select id="pay-supplier" required value={supplierId} onChange={(e) => pickSupplier(e.target.value)} className={inputCls}>
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {outstanding !== null && (
            <p className={`mt-1 text-xs font-medium ${outstanding > 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {outstanding > 0 ? `Owing: ${ngn(outstanding)}` : outstanding < 0 ? `In credit: ${ngn(-outstanding)}` : "Balance settled"}
            </p>
          )}
        </div>

        <div>
          <label className={labelCls} htmlFor="pay-po">Against order (optional)</label>
          <select id="pay-po" value={poId} onChange={(e) => setPoId(e.target.value)} className={inputCls} disabled={!supplierId}>
            <option value="">Supplier balance (no specific order)</option>
            {pos.map((p) => (
              <option key={p.id} value={p.id}>{p.poNumber} — {p.status} · {ngn(p.totalCost)}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="pay-amount">Amount (₦)</label>
            <input id="pay-amount" type="number" min={0.01} step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pay-date">Payment date</label>
            <input id="pay-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div>
          <span className={labelCls}>Method</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["bank_transfer", "cash", "pos", "credit_note"] as const).map((m) => {
              const Icon = METHOD_ICONS[m];
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  aria-pressed={method === m}
                  className={`focus-ring flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors duration-200 ${
                    method === m
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]"
                      : "border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]/50"
                  }`}
                >
                  <Icon size={16} aria-hidden="true" />
                  {METHOD_LABELS[m]}
                </button>
              );
            })}
          </div>
          {method === "credit_note" && (
            <p className="mt-1 text-xs text-[var(--color-muted-fg)]">
              A credit note reduces what you owe the supplier — no money leaves the hospital.
            </p>
          )}
        </div>

        {showBankPicker && (
          <div>
            <label className={labelCls} htmlFor="pay-bank">Bank account</label>
            <select id="pay-bank" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className={inputCls}>
              <option value="">Default bank account</option>
              {bankAccounts.map((a) => (
                <option key={a.account_id} value={a.account_id ?? ""}>{a.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--color-muted-fg)]">
              The payment posts to the Banking ledger as money leaving the hospital.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="pay-ref">Reference (optional)</label>
            <input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} placeholder="Teller / transfer ref…" />
          </div>
          <div>
            <label className={labelCls} htmlFor="pay-notes">Notes</label>
            <input id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Optional note" />
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={busy || !supplierId} className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60">
            {busy ? "Recording…" : "Record payment"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// SHARED
// ---------------------------------------------------------------------------

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
