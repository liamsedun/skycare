"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Wallet } from "lucide-react";
import { ngn } from "@/lib/auth";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";
import { errorBanner, btnBase, mutedSm, flexWrapGap2, sectionTitle, rowStart } from "@/lib/ui-constants";
import ImportExportMenu from "@/components/ui/import-export-menu";
import FilterBar from "@/components/filters/filter-bar";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { btnPrimary, METHOD_LABELS, METHOD_ICONS, SupplierBalance, SupplierOption } from "./vendor-purchasing-shared";
import { RecordPaymentModal } from "./vendor-purchasing-record-payment-modal";

// ---------------------------------------------------------------------------
// PAYMENTS
// ---------------------------------------------------------------------------
export interface PaymentRow {
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

export const blockedImport = (msg: string) => async (): Promise<ImportResult> => ({
  created: 0,
  failed: 0,
  errors: [msg],
});

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
        <div className={flexWrapGap2}>
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
          <Wallet size={36} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className={sectionTitle}>No payments recorded.</p>
          <p className={mutedSm}>Pay by instant bank transfer, cash or POS — or buy on credit and settle later.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
          <table className={rowStart}>
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/50 text-[10px] uppercase tracking-wider text-[var(--color-muted-fg)]">
                <th className={btnBase}>Date</th>
                <th className={btnBase}>Supplier</th>
                <th className={btnBase}>PO</th>
                <th className={btnBase}>Method</th>
                <th className={btnBase}>Amount</th>
                <th className={btnBase}>Reference</th>
                <th className={btnBase}>Recorded by</th>
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
