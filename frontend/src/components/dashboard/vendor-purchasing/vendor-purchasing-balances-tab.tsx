"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { ngn, formatDate } from "@/lib/auth";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";
import { btnBase, mutedSm, sectionTitle, rowStart } from "@/lib/ui-constants";
import ImportExportMenu from "@/components/ui/import-export-menu";
import FilterBar from "@/components/filters/filter-bar";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { SupplierBalance } from "./vendor-purchasing-shared";

// ---------------------------------------------------------------------------
// BALANCES
// ---------------------------------------------------------------------------
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
          <p className={sectionTitle}>No supplier activity yet.</p>
          <p className={mutedSm}>
            Balances appear once goods are received from suppliers or payments are recorded.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
          <table className={rowStart}>
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/50 text-[10px] uppercase tracking-wider text-[var(--color-muted-fg)]">
                <th className={btnBase}>Supplier</th>
                <th className={btnBase}>Total bought</th>
                <th className={btnBase}>Total paid</th>
                <th className={btnBase}>Outstanding</th>
                <th className={btnBase}>POs</th>
                <th className={btnBase}>Payments</th>
                <th className={btnBase}>Last activity</th>
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
