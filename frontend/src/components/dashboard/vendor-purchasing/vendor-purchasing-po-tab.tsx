"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowDownToLine, Building2, CheckCircle2, FileText, Loader2, Package, Plus, Send } from "lucide-react";
import { ngn, formatDate } from "@/lib/auth";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";
import { errorBanner, mutedSm, flexWrapGap2, fgSemibold, sectionTitle } from "@/lib/ui-constants";
import ImportExportMenu from "@/components/ui/import-export-menu";
import FilterBar from "@/components/filters/filter-bar";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { btnPrimary, btnGhost, btnDanger, inputCls, PO_STATUS_STYLES, SupplierOption, PurchaseOrder, PoDetail } from "./vendor-purchasing-shared";
import { CreateOrderModal } from "./vendor-purchasing-create-order-modal";
import { ReceiveGoodsModal } from "./vendor-purchasing-receive-goods-modal";
import { PoDetailModal } from "./vendor-purchasing-po-detail-modal";

// ---------------------------------------------------------------------------
// PURCHASE ORDERS
// ---------------------------------------------------------------------------
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
        <div className={flexWrapGap2}>
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
        <p role="alert" className={errorBanner}>
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
          <p className={sectionTitle}>No purchase orders found.</p>
          <p className={mutedSm}>Order drugs from your suppliers — choose instant payment or credit.</p>
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
                    <div className={flexWrapGap2}>
                      <span className={fgSemibold}>{po.poNumber}</span>
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
                      <span className={fgSemibold}>{ngn(po.totalCost)}</span>
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
