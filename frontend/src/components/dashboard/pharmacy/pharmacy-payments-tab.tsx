"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ImportExportMenu from "@/components/ui/import-export-menu";
import DateRangeBar from "@/components/filters/date-range-bar";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";
import { btnBase, divideBorder, flexWrapGap2, rowStart, tableHeadCell } from "@/lib/ui-constants";
import { Badge, fetchAll, inputCls, ngn, Stat } from "./pharmacy-shared";

// ---------------------------------------------------------------------------
// PAYMENTS TAB - payment ledger + bank ledger preview
// ---------------------------------------------------------------------------
interface PaymentRow {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  status: string;
  received_at: string;
  invoice_id: string;
  pharmacy_invoices: { invoice_number: string; patients: { first_name: string; last_name: string } | null } | null;
}

export function PaymentsTab({ viewOnly = false }: { viewOnly?: boolean }) {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState<
    Array<{
      id: string;
      direction: string;
      amount: number;
      source: string;
      method: string | null;
      reference: string | null;
      source_ref: string | null;
      created_at: string;
      hospital_bank_accounts: { bank_name: string; account_name: string; account_number: string } | null;
    }>
  >([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (q.trim()) params.set("q", q.trim());
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/pharmacy/payments?${params.toString()}`, { cache: "no-store" });
      if (res.ok) setRows((await res.json()).data ?? []);
    } finally {
      setLoading(false);
    }
  }, [q, fromDate, toDate]);

  useEffect(() => {
    void load();
    (async () => {
      try {
        const res = await fetch("/api/pharmacy/bank-ledger?limit=12", { cache: "no-store" });
        if (res.ok) setLedger((await res.json()).data ?? []);
      } finally {
        setLedgerLoading(false);
      }
    })();
  }, [load]);

  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.amount), 0), [rows]);

  const visible = rows.filter((r) => inDateRange(r.received_at, fromDate, toDate));

  const PAYMENTS_COLUMNS = ["invoice_number", "patient_name", "method", "amount", "reference", "received_at"];

  const paymentsRows = () =>
    rows.map((r) => [
      r.pharmacy_invoices?.invoice_number ?? "",
      r.pharmacy_invoices?.patients ? `${r.pharmacy_invoices.patients.first_name} ${r.pharmacy_invoices.patients.last_name}` : "Walk-in",
      r.method,
      r.amount,
      r.reference ?? "",
      r.received_at,
    ]);

  function exportCsv() {
    if (rows.length === 0) { alert("Nothing to export â€” there are no payments yet."); return; }
    downloadCsv(`pharmacy-payments-${dateStamp()}.csv`, PAYMENTS_COLUMNS, paymentsRows());
  }

  function exportPdf() {
    if (rows.length === 0) { alert("Nothing to export â€” there are no payments yet."); return; }
    printTable("Pharmacy Payments", PAYMENTS_COLUMNS, paymentsRows());
  }

  async function importPayments(rowsIn: string[][]): Promise<ImportResult> {
    const invoices = await fetchAll<{ id: string; invoice_number: string }>("/api/pharmacy/invoices");
    const invMap = new Map<string, string>(invoices.map((i) => [String(i.invoice_number), i.id]));
    const errors: string[] = [];
    let created = 0;
    for (let i = 0; i < rowsIn.length; i++) {
      const r = rowsIn[i]!;
      const invoiceId = invMap.get(String(r[0] ?? "").trim());
      if (!invoiceId) { errors.push(`Row ${i + 1}: unknown invoice number "${r[0] ?? ""}"`); continue; }
      const amount = Number(r[3]);
      if (!Number.isFinite(amount) || amount <= 0) { errors.push(`Row ${i + 1}: invalid amount "${r[3] ?? ""}"`); continue; }
      const res = await fetch("/api/pharmacy/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          payments: [{ method: String(r[2] ?? "cash").trim().toLowerCase() || "cash", amount, reference: String(r[4] ?? "").trim() || undefined }],
        }),
      });
      const body = await res.json();
      if (!res.ok) errors.push(`Row ${i + 1}: ${body.error ?? "payment failed"}`);
      else created++;
    }
    return { created, failed: errors.length, errors };
  }

  return (
    <div className="space-y-4">
      <div className={flexWrapGap2}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search invoice, patient, referenceâ€¦"
          aria-label="Search pharmacy payments"
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
        <ImportExportMenu
          entityLabel="Pharmacy Payments"
          exportCsv={exportCsv}
          exportPdf={exportPdf}
          importColumns={PAYMENTS_COLUMNS}
          importSample={[["PH-INV-0001", "Ada Okafor", "cash", "15000", "REF-1001"]]}
          templateFilename="pharmacy-payments-import-template.csv"
          onImport={importPayments}
          onImported={() => void load()}
          allowImport={!viewOnly}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Transactions" value={rows.length} />
        <Stat label="Collected" value={ngn(total)} tone="ok" />
        <Stat label="Cash" value={ngn(rows.filter((r) => r.method === "cash").reduce((s, r) => s + Number(r.amount), 0))} />
        <Stat label="POS" value={ngn(rows.filter((r) => r.method === "pos").reduce((s, r) => s + Number(r.amount), 0))} />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-muted)] px-4 py-2.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Bank ledger â€” money into the bank (latest)</h4>
        </div>
        {ledgerLoading ? (
          <p className="px-4 py-6 text-center text-xs text-[var(--color-muted-fg)]">Loadingâ€¦</p>
        ) : ledger.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-[var(--color-muted-fg)]">
            No bank entries yet â€” cash/transfer/POS payments will be posted here automatically.
          </p>
        ) : (
          <div className={divideBorder}>
            {ledger.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--color-foreground)]">
                    {l.direction === "in" ? "+" : "âˆ’"}{ngn(l.amount)}
                    <span className="ml-2 text-xs font-normal uppercase text-[var(--color-muted-fg)]">{l.method ?? l.source}</span>
                  </p>
                  <p className="truncate text-xs text-[var(--color-muted-fg)]">
                    {l.hospital_bank_accounts ? `${l.hospital_bank_accounts.bank_name} (â€¢â€¢ ${l.hospital_bank_accounts.account_number.slice(-4)})` : "No account"} Â· {l.reference ?? l.source_ref ?? "â€”"} Â· {new Date(l.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className={rowStart}>
          <thead>
            <tr className={tableHeadCell}>
              <th scope="col" className={btnBase}>Invoice</th>
              <th scope="col" className={btnBase}>Patient</th>
              <th scope="col" className={btnBase}>Method</th>
              <th scope="col" className={btnBase}>Amount</th>
              <th scope="col" className={btnBase}>Reference</th>
              <th scope="col" className={btnBase}>When</th>
            </tr>
          </thead>
          <tbody className={divideBorder}>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">Loadingâ€¦</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">No payments recorded yet.</td></tr>
            ) : (
              visible.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-medium">{r.pharmacy_invoices?.invoice_number ?? "â€”"}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">
                    {r.pharmacy_invoices?.patients ? `${r.pharmacy_invoices.patients.first_name} ${r.pharmacy_invoices.patients.last_name}` : "Walk-in"}
                  </td>
                  <td className="px-4 py-2.5"><Badge value={r.method} /></td>
                  <td className="px-4 py-2.5 font-semibold text-emerald-600">{ngn(r.amount)}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{r.reference ?? "â€”"}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{new Date(r.received_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
