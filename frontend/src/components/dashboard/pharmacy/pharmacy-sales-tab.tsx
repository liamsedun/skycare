"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Plus, Receipt } from "lucide-react";
import ImportExportMenu from "@/components/ui/import-export-menu";
import DateRangeBar from "@/components/filters/date-range-bar";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";
import { btnBase, divideBorder, flexWrapGap2, rowStart, tableHeadCell } from "@/lib/ui-constants";
import { Badge, btnGhost, btnPrimary, inputCls, ngn, type InvoiceRow } from "./pharmacy-shared";
import { ConvertSaleModal } from "./pharmacy-convert-sale-modal";
import { InvoiceDetail } from "./pharmacy-invoice-detail";
import { NewSaleModal } from "./pharmacy-new-sale-modal";

// ---------------------------------------------------------------------------
// SALES TAB - counter sales ledger with search, filters and exports
// ---------------------------------------------------------------------------
export function SalesTab({ viewOnly = false }: { viewOnly?: boolean }) {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [detail, setDetail] = useState<InvoiceRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "50" });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/pharmacy/invoices?${params.toString()}`, { cache: "no-store" });
      if (res.ok) setRows((await res.json()).data ?? []);
    } finally {
      setLoading(false);
    }
  }, [status, q, fromDate, toDate]);

  useEffect(() => { void load(); }, [load]);

  async function fetchDetail(id: string) {
    const res = await fetch(`/api/pharmacy/invoices/${id}`, { cache: "no-store" });
    if (res.ok) setDetail((await res.json()).data);
  }

  const SALES_COLUMNS = [
    "invoice_number", "patient_number", "patient_name", "source", "subtotal",
    "discount", "tax", "total_amount", "paid_amount", "status", "created_at",
  ];

  const salesRows = () =>
    rows.map((r) => [
      r.invoice_number,
      r.patients?.patient_number ?? "",
      r.patients ? `${r.patients.first_name} ${r.patients.last_name}` : "",
      r.source,
      r.subtotal,
      r.discount_amount,
      r.tax_amount,
      r.total_amount,
      r.paid_amount,
      r.status,
      r.created_at,
    ]);

  function exportCsv() {
    if (rows.length === 0) { alert("Nothing to export â€” there are no sales yet."); return; }
    downloadCsv(`pharmacy-sales-${dateStamp()}.csv`, SALES_COLUMNS, salesRows());
  }

  function exportPdf() {
    if (rows.length === 0) { alert("Nothing to export â€” there are no sales yet."); return; }
    printTable("Pharmacy Sales", SALES_COLUMNS, salesRows());
  }

  const visible = rows.filter((r) => inDateRange(r.created_at, fromDate, toDate));

  async function importSales(_rows: string[][]): Promise<ImportResult> {
    return {
      created: 0,
      failed: 0,
      errors: ["Sales are recorded through the New sale workflow (they require prescription/stock items) and cannot be imported."],
    };
  }

  return (
    <div className="space-y-4">
      <div className={flexWrapGap2}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search invoice, patient, drugâ€¦"
          aria-label="Search pharmacy sales"
          className={`${inputCls} w-56`}
        />
        <DateRangeBar
          from={fromDate}
          to={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
          onClear={() => { setFromDate(""); setToDate(""); }}
        />
        <div className="flex-1" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
        <ImportExportMenu
          entityLabel="Pharmacy Sales"
          exportCsv={exportCsv}
          exportPdf={exportPdf}
          importColumns={SALES_COLUMNS}
          templateFilename="pharmacy-sales-import-template.csv"
          onImport={importSales}
          allowImport={!viewOnly}
        />
        {!viewOnly && (
        <>
        <button type="button" onClick={() => setConvertOpen(true)} className={btnGhost}>
          <FileText size={14} aria-hidden="true" /> Convert prescription
        </button>
        <button type="button" onClick={() => setOpen(true)} className={btnPrimary}>
          <Plus size={14} aria-hidden="true" /> New sale
        </button>
        </>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className={rowStart}>
          <thead>
            <tr className={tableHeadCell}>
              <th scope="col" className={btnBase}>Invoice</th>
              <th scope="col" className={btnBase}>Patient</th>
              <th scope="col" className={btnBase}>Source</th>
              <th scope="col" className={btnBase}>Total</th>
              <th scope="col" className={btnBase}>Paid</th>
              <th scope="col" className={btnBase}>Status</th>
              <th scope="col" className="px-4 py-2.5 text-right"></th>
            </tr>
          </thead>
          <tbody className={divideBorder}>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">Loadingâ€¦</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">No pharmacy sales yet.</td></tr>
            ) : (
              visible.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-[var(--color-foreground)]">{r.invoice_number}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">
                    {r.patients ? `${r.patients.first_name} ${r.patients.last_name}` : "â€”"}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)] capitalize">{r.source}</td>
                  <td className={btnBase}>{ngn(r.total_amount)}</td>
                  <td className="px-4 py-2.5 text-emerald-600">{ngn(r.paid_amount)}</td>
                  <td className="px-4 py-2.5"><Badge value={r.status} /></td>
                  <td className="px-4 py-2.5 text-right">
                    <button type="button" onClick={() => { setDetail(null); void fetchDetail(r.id); }} className={btnGhost}>
                      <Receipt size={13} aria-hidden="true" /> View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open && <NewSaleModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); void load(); }} />}
      {convertOpen && <ConvertSaleModal onClose={() => setConvertOpen(false)} onSaved={() => { setConvertOpen(false); void load(); }} />}
      {detail && <InvoiceDetail invoice={detail} onClose={() => setDetail(null)} onChanged={() => { void fetchDetail(detail.id); void load(); }} viewOnly={viewOnly} />}
    </div>
  );
}
