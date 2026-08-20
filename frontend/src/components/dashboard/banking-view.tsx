"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Loader2,
  Plus,
  Printer,
  Scale,
  Trash2,
  Wallet,
} from "lucide-react";
import ImportExportMenu from "@/components/ui/import-export-menu";
import DateRangeBar from "@/components/filters/date-range-bar";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";
import { mutedXs, mutedFg, errorBanner, btnBase, cardTitle, flexGap2, flexWrapGap2, fgMedium, mutedXsMt1, fgSemibold, rowStart } from "@/lib/ui-constants";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";
const naira = (n: number) => `₦${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

interface AccountCard {
  id: string; // "cash" | bank uuid
  account_id: string | null;
  label: string;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  is_active: boolean;
  balance: number;
  month_in: number;
  month_out: number;
}

interface LedgerItem {
  id: string;
  account_id: string | null;
  account_label: string;
  direction: "in" | "out";
  amount: number;
  method: string | null;
  source: string;
  source_ref: string | null;
  reference: string | null;
  notes: string | null;
  recorded_at: string;
}

interface StmtRow extends LedgerItem {
  running_balance: number;
}

interface StmtData {
  account_id: string | null;
  account_label: string;
  from: string | null;
  to: string | null;
  opening: number;
  in: number;
  out: number;
  closing: number;
  rows: StmtRow[];
}

const SOURCE_LABELS: Record<string, string> = {
  payment: "Patient payment",
  lab: "Lab income",
  ward: "Ward income",
  other_income: "Other income",
  expense: "Expense",
  adjustment: "Manual entry",
  transfer: "Transfer",
  opening: "Opening balance",
  payroll: "Payroll",
  pharmacy: "Pharmacy",
};

const MANUAL_SOURCES = new Set(["adjustment", "transfer", "opening"]);

export default function BankingView() {
  const [accounts, setAccounts] = useState<AccountCard[]>([]);
  const [recent, setRecent] = useState<LedgerItem[]>([]);
  const [monthTotals, setMonthTotals] = useState({ in: 0, out: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [showEntry, setShowEntry] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showOpening, setShowOpening] = useState<AccountCard | null>(null);
  const [busy, setBusy] = useState(false);

  // Statement drill-down
  const [stmtAccount, setStmtAccount] = useState<AccountCard | null>(null);
  const [stmtMonth, setStmtMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [stmt, setStmt] = useState<StmtData | null>(null);
  const [stmtLoading, setStmtLoading] = useState(false);
  const [bankClosing, setBankClosing] = useState("");

  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/banking", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load banking");
      setAccounts(body.data?.accounts ?? []);
      setRecent(body.data?.recent ?? []);
      setMonthTotals(body.data?.month_totals ?? { in: 0, out: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load banking");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLedger = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (accountFilter !== "all") params.set("account", accountFilter);
      if (directionFilter !== "all") params.set("direction", directionFilter);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      const res = await fetch(`/api/banking/ledger?${params}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load ledger");
      setLedger(body.data ?? []);
      setTotal(body.meta?.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load ledger");
    } finally {
      setLedgerLoading(false);
    }
  }, [page, accountFilter, directionFilter, sourceFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const visibleLedger = useMemo(
    () => ledger.filter((l) => inDateRange(l.recorded_at, from, to)),
    [ledger, from, to]
  );

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountFilter),
    [accounts, accountFilter]
  );

  const pages = Math.max(1, Math.ceil(total / pageSize));

  async function saveEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/banking/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: form.get("direction"),
          account: form.get("account"),
          amount: Number(form.get("amount")),
          method: form.get("method") || null,
          reference: form.get("reference") || null,
          notes: form.get("notes") || null,
          recordedAt: form.get("recordedAt") || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to record entry");
      setShowEntry(false);
      await Promise.all([load(), loadLedger()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record entry");
    } finally {
      setBusy(false);
    }
  }

  async function saveTransfer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const fromAccount = String(form.get("fromAccount") ?? "");
    const toAccount = String(form.get("toAccount") ?? "");
    if (fromAccount === toAccount) {
      setError("Source and destination must be different accounts");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/banking/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAccount,
          toAccount,
          amount: Number(form.get("amount")),
          method: form.get("method") || null,
          notes: form.get("notes") || null,
          recordedAt: form.get("recordedAt") || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to record transfer");
      setShowTransfer(false);
      await Promise.all([load(), loadLedger()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record transfer");
    } finally {
      setBusy(false);
    }
  }

  async function saveOpening(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!showOpening) return;
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/banking/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: "in",
          source: "opening",
          account: showOpening.id,
          amount: Number(form.get("amount")),
          recordedAt: form.get("recordedAt") || null,
          notes: form.get("notes") || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to set opening balance");
      setShowOpening(null);
      await Promise.all([load(), loadLedger()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set opening balance");
    } finally {
      setBusy(false);
    }
  }

  const loadStatement = useCallback(async () => {
    if (!stmtAccount) return;
    setStmtLoading(true);
    setStmt(null);
    try {
      const [y, m] = stmtMonth.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const from = `${stmtMonth}-01`;
      const to = `${stmtMonth}-${String(lastDay).padStart(2, "0")}`;
      const res = await fetch(`/api/banking/statement?account=${encodeURIComponent(stmtAccount.id)}&from=${from}&to=${to}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load statement");
      setStmt(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load statement");
    } finally {
      setStmtLoading(false);
    }
  }, [stmtAccount, stmtMonth]);

  useEffect(() => {
    if (stmtAccount) loadStatement();
  }, [stmtAccount, stmtMonth, loadStatement]);

  const dailySummary = useMemo(() => {
    if (!stmt) return [];
    const byDate = new Map<string, { date: string; in: number; out: number; closing: number }>();
    let running = stmt.opening;
    for (const r of [...stmt.rows].reverse()) {
      running += r.direction === "in" ? r.amount : -r.amount;
      const d = r.recorded_at.slice(0, 10);
      const agg = byDate.get(d) ?? { date: d, in: 0, out: 0, closing: running };
      if (r.direction === "in") agg.in += r.amount;
      else agg.out += r.amount;
      agg.closing = running;
      byDate.set(d, agg);
    }
    return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [stmt]);

  async function deleteEntry(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/banking/entries/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete entry");
      await Promise.all([load(), loadLedger()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete entry");
    } finally {
      setBusy(false);
    }
  }

  const statementCsv = () => {
    if (!stmt || stmt.rows.length === 0) return;
    const cols = ["date", "details", "direction", "method", "reference", "in", "out", "running_balance"];
    const rows = stmt.rows.map((r) => [
      r.recorded_at.slice(0, 10),
      `${SOURCE_LABELS[r.source] ?? r.source}${r.source_ref ? ` - ${r.source_ref}` : ""}`,
      r.direction,
      r.method ?? "",
      r.reference ?? "",
      r.direction === "in" ? r.amount : "",
      r.direction === "out" ? r.amount : "",
      r.running_balance,
    ]);
    downloadCsv(`statement-${stmt.account_label.replace(/\s+/g, "-").toLowerCase()}-${stmtMonth}.csv`, cols, rows);
  };

  const statementPrint = async () => {
    if (!stmt || stmt.rows.length === 0) return;
    const orgRes = await fetch("/api/tenant/branding", { cache: "no-store" });
    const orgBody = orgRes.ok ? await orgRes.json() : null;
    const org = orgBody?.data ?? {};
    const orgAddress = [org.address, [org.city, org.state].filter(Boolean).join(", "), org.country].filter(Boolean).join(", ");
    const contact = [org.phone && `Tel: ${org.phone}`, org.email && `Email: ${org.email}`, org.website].filter(Boolean).join(" • ");
    const rowHtml = stmt.rows
      .map(
        (r) => `<tr><td>${r.recorded_at.slice(0, 10)}</td><td>${SOURCE_LABELS[r.source] ?? r.source}${r.source_ref ? ` — ${r.source_ref}` : ""}</td><td>${r.direction === "in" ? "+" : "−"}${naira(r.amount)}</td><td class="amt">${naira(r.running_balance)}</td></tr>`
      )
      .join("");
    const w = window.open("", "_blank", "width=840,height=980");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Bank Statement</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; margin: 0; padding: 40px; background: #fff; }
  .header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
  .logo { width: 56px; height: 56px; object-fit: contain; }
  .logo-fallback { width: 56px; height: 56px; border-radius: 8px; background: #e0f2fe; border: 1px solid #bae6fd; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 20px; color: #0369a1; }
  h1 { font-size: 16px; margin: 0; text-transform: uppercase; }
  .sub { font-size: 11px; color: #555; margin-top: 2px; }
  .contact { font-size: 10px; color: #777; margin-top: 2px; }
  .title { text-align: center; margin-bottom: 20px; }
  .title p:first-child { font-size: 17px; font-weight: 700; margin: 0; text-transform: uppercase; }
  .title p:nth-child(2) { font-size: 11px; color: #555; margin: 4px 0 2px; }
  .title p:last-child { font-size: 11px; color: #777; margin: 0; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #ccc; font-size: 13px; margin-bottom: 20px; }
  tr { border-bottom: 1px solid #eee; }
  td, th { padding: 8px 12px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; color: #555; border-bottom: 1px solid #bbb; }
  td.amt, th.amt { text-align: right; }
  .totals td { font-weight: 700; border-top: 1px solid #bbb; background: #f5f5f5; }
  @media print { body { padding: 20px; } }
</style></head><body>
  <div class="header">
    ${org.logo_url ? `<img class="logo" src="${org.logo_url}" alt="logo" />` : `<div class="logo-fallback">${(org.name || "S")[0]}</div>`}
    <div>
      <h1>${org.name || "Hospital"}</h1>
      ${orgAddress ? `<p class="sub">${orgAddress}</p>` : ""}
      ${contact ? `<p class="contact">${contact}</p>` : ""}
    </div>
  </div>
  <div class="title">
    <p>Bank Statement — ${stmt.account_label}</p>
    <p>For the period ${stmt.from} to ${stmt.to}</p>
    <p>Opening ${naira(stmt.opening)} · Receipts ${naira(stmt.in)} · Payments ${naira(stmt.out)} · Closing ${naira(stmt.closing)}</p>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Details</th><th class="amt">Amount</th><th class="amt">Balance</th></tr></thead>
    <tbody>${rowHtml}</tbody>
    <tfoot><tr class="totals"><td>Closing balance</td><td></td><td></td><td class="amt">${naira(stmt.closing)}</td></tr></tfoot>
  </table>
  <script>window.onload = function(){ window.print(); };</script>
</body></html>`);
    w.document.close();
  };

  const LEDGER_COLUMNS = ["account_label", "direction", "amount", "method", "source", "reference", "notes", "recorded_at"];

  const ledgerRows = () =>
    ledger.map((l) => [
      l.account_label,
      l.direction,
      l.amount,
      l.method ?? "",
      SOURCE_LABELS[l.source] ?? l.source,
      l.reference ?? "",
      l.notes ?? "",
      l.recorded_at,
    ]);

  function exportCsv() {
    if (ledger.length === 0) { alert("Nothing to export — no ledger entries yet."); return; }
    downloadCsv(`banking-ledger-${dateStamp()}.csv`, LEDGER_COLUMNS, ledgerRows());
  }

  function exportPdf() {
    if (ledger.length === 0) { alert("Nothing to export — no ledger entries yet."); return; }
    printTable("Banking Ledger", LEDGER_COLUMNS, ledgerRows());
  }

  async function importLedger(rowsIn: string[][]): Promise<ImportResult> {
    const accountMap = new Map<string, string>(accounts.map((a) => [String(a.label).trim().toLowerCase(), a.id]));
    const errors: string[] = [];
    let created = 0;
    for (let i = 0; i < rowsIn.length; i++) {
      const r = rowsIn[i]!;
      const label = String(r[0] ?? "").trim();
      const direction = String(r[1] ?? "").trim().toLowerCase();
      const amount = Number(r[2]);
      const accountId = accountMap.get(label.toLowerCase());
      if (!accountId) { errors.push(`Row ${i + 1}: unknown account "${label}"`); continue; }
      if (direction !== "in" && direction !== "out") { errors.push(`Row ${i + 1}: direction must be "in" or "out"`); continue; }
      if (!Number.isFinite(amount) || amount <= 0) { errors.push(`Row ${i + 1}: invalid amount "${r[2] ?? ""}"`); continue; }
      const res = await fetch("/api/banking/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          account: accountId,
          amount,
          method: String(r[3] ?? "").trim() || null,
          reference: String(r[5] ?? "").trim() || null,
          notes: String(r[6] ?? "").trim() || null,
          recordedAt: String(r[7] ?? "").trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) errors.push(`Row ${i + 1}: ${body.error ?? "entry failed"}`);
      else created++;
    }
    return { created, failed: errors.length, errors };
  }

  const reconciliation = useMemo(() => {
    if (!stmt) return null;
    const entered = Number(bankClosing);
    if (isNaN(entered) && bankClosing !== "") return { valid: false as const };
    const diff = Math.round((stmt.closing - entered) * 100) / 100;
    return { valid: true as const, diff, balanced: diff === 0 };
  }, [stmt, bankClosing]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-foreground)]">Banking</h1>
          <p className="mt-0.5 text-sm text-[var(--color-muted-fg)]">
            Every receipt lands in Cash or a bank; every payment leaves from one. Banks added in Settings appear here automatically.
          </p>
        </div>
        <div className={flexWrapGap2}>
          <ImportExportMenu
            entityLabel="Banking Ledger"
            exportCsv={exportCsv}
            exportPdf={exportPdf}
            importColumns={LEDGER_COLUMNS}
            importSample={[["Cash", "in", "50000", "cash", "", "REF-9001", "Deposit", "2026-08-11"]]}
            templateFilename="banking-ledger-import-template.csv"
            onImport={importLedger}
            onImported={() => { void load(); void loadLedger(); }}
          />
          <button
            type="button"
            onClick={() => setShowTransfer(true)}
            className="focus-ring inline-flex items-center gap-2 rounded-lg border border-[var(--color-primary)] px-3.5 py-2 text-sm font-semibold text-[var(--color-primary)]"
          >
            <ArrowLeftRight size={16} /> Transfer
          </button>
          <button
            type="button"
            onClick={() => setShowEntry(true)}
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-sm font-semibold text-white"
          >
            <Plus size={16} /> Record entry
          </button>
        </div>
      </header>

      {error && (
        <p role="alert" className={errorBanner}>
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="animate-spin text-[var(--color-muted-fg)]" />
        </div>
      ) : (
        <>
          {/* Month totals */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                <ArrowDownLeft size={14} /> Received this month
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-800">{naira(monthTotals.in)}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-700">
                <ArrowUpRight size={14} /> Paid out this month
              </p>
              <p className="mt-1 text-2xl font-bold text-rose-800">{naira(monthTotals.out)}</p>
            </div>
          </div>

          {/* Account cards — Cash + every bank from Settings (auto-linked) */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">Accounts</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className={`focus-ring rounded-xl border p-4 ${
                    accountFilter === acc.id
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                      : "border-[var(--color-border)] bg-white"
                  } ${acc.is_active ? "" : "opacity-60"}`}
                >
                  <button
                    type="button"
                    onClick={() => setAccountFilter(accountFilter === acc.id ? "all" : acc.id)}
                    className="block w-full cursor-pointer text-left"
                    aria-label={`Filter transactions for ${acc.label}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className={flexGap2}>
                        {acc.account_id ? <Landmark size={16} className={mutedFg} /> : <Banknote size={16} className={mutedFg} />}
                        <span className={cardTitle}>{acc.label}</span>
                      </div>
                      {!acc.is_active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">Inactive</span>}
                    </div>
                    <p className="mt-1 truncate text-xs text-[var(--color-muted-fg)]">
                      {acc.account_name ? `${acc.account_name} · ••${acc.account_number?.slice(-4) ?? ""}` : "Hospital cash drawer"}
                    </p>
                    <p className="mt-3 text-2xl font-bold text-[var(--color-foreground)]">{naira(acc.balance)}</p>
                    <p className={mutedXsMt1}>
                      <span className="font-semibold text-emerald-700">+{naira(acc.month_in)}</span>
                      <span className="mx-1.5">·</span>
                      <span className="font-semibold text-rose-700">−{naira(acc.month_out)}</span>
                      <span className="ml-1">this month</span>
                    </p>
                  </button>
                  <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-border)] pt-3">
                    <button
                      type="button"
                      onClick={() => { setStmtAccount(acc); setStmtMonth(new Date().toISOString().slice(0, 7)); setStmt(null); setBankClosing(""); }}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary-soft)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-primary)] hover:opacity-90"
                    >
                      <CalendarDays size={13} /> Statement
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowOpening(acc); setError(null); }}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-muted-fg)] hover:bg-slate-50"
                    >
                      <Wallet size={13} /> Opening balance
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Transactions */}
          <section>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-sm font-semibold text-[var(--color-foreground)]">Transactions</h2>
              <select className={inputCls + " w-auto"} value={accountFilter} onChange={(e) => { setAccountFilter(e.target.value); setPage(1); }} aria-label="Filter by account">
                <option value="all">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
              <select className={inputCls + " w-auto"} value={directionFilter} onChange={(e) => { setDirectionFilter(e.target.value); setPage(1); }} aria-label="Filter by direction">
                <option value="all">In &amp; out</option>
                <option value="in">Receipts only</option>
                <option value="out">Payments only</option>
              </select>
              <select className={inputCls + " w-auto"} value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }} aria-label="Filter by source">
                <option value="all">All sources</option>
                {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <DateRangeBar
                from={from}
                to={to}
                onFromChange={setFrom}
                onToChange={setTo}
                onClear={() => { setFrom(""); setTo(""); }}
              />
            </div>

            {selectedAccount && accountFilter !== "all" && (
              <p className="mb-3 text-xs font-medium text-[var(--color-muted-fg)]">
                Showing <span className={fgSemibold}>{selectedAccount.label}</span> transactions only.
              </p>
            )}

            <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white">
              {ledgerLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 size={20} className="animate-spin text-[var(--color-muted-fg)]" />
                </div>
              ) : visibleLedger.length === 0 ? (
                <p className="py-12 text-center text-sm text-[var(--color-muted-fg)]">No transactions match these filters.</p>
              ) : (
                <table className={rowStart}>
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                      <th className={btnBase}>Date</th>
                      <th className={btnBase}>Details</th>
                      <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Account</th>
                      <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Method</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                      <th className="w-10 px-2 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLedger.map((item) => (
                      <tr key={item.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">
                          {new Date(item.recorded_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-4 py-2.5">
                          <p className={fgMedium}>{SOURCE_LABELS[item.source] ?? item.source}</p>
                          <p className="truncate text-xs text-[var(--color-muted-fg)]">
                            {[item.source_ref, item.reference, item.notes].filter(Boolean).join(" · ") || "—"}
                          </p>
                          {MANUAL_SOURCES.has(item.source) && (
                            <button
                              type="button"
                              onClick={() => deleteEntry(item.id)}
                              disabled={busy}
                              className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-destructive)] hover:underline disabled:opacity-50"
                            >
                              <Trash2 size={10} /> {item.source === "transfer" ? "Delete transfer" : "Delete"}
                            </button>
                          )}
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-2.5 text-xs text-[var(--color-muted-fg)] sm:table-cell">
                          {item.account_label}
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-2.5 text-xs capitalize text-[var(--color-muted-fg)] sm:table-cell">
                          {item.method ?? "—"}
                        </td>
                        <td className={`whitespace-nowrap px-4 py-2.5 text-right font-semibold ${item.direction === "in" ? "text-emerald-700" : "text-rose-700"}`}>
                          {item.direction === "in" ? "+" : "−"}{naira(item.amount)}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          {item.direction === "in"
                            ? <ArrowDownLeft size={14} className="ml-auto text-emerald-600" />
                            : <ArrowUpRight size={14} className="ml-auto text-rose-600" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {pages > 1 && (
                <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-2.5">
                  <p className={mutedXs}>
                    Page {page} of {pages} · {total.toLocaleString()} transactions
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="focus-ring rounded-lg border border-[var(--color-border)] p-1.5 disabled:opacity-40"
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={page >= pages}
                      onClick={() => setPage((p) => p + 1)}
                      className="focus-ring rounded-lg border border-[var(--color-border)] p-1.5 disabled:opacity-40"
                      aria-label="Next page"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* Manual entry modal */}
      {showEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Record banking entry">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowEntry(false)} aria-label="Close" />
          <form onSubmit={saveEntry} className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-[var(--shadow-xl)]">
            <div className="mb-4 flex items-center gap-2">
              <Wallet size={18} className="text-[var(--color-primary)]" />
              <h2 className="text-base font-bold text-[var(--color-foreground)]">Record entry</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelCls} htmlFor="be-direction">Type</label>
                <select id="be-direction" name="direction" className={inputCls} required>
                  <option value="in">Receipt (money in)</option>
                  <option value="out">Payment (money out)</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="be-account">Account</label>
                <select id="be-account" name="account" className={inputCls} required defaultValue="cash">
                  {accounts.filter((a) => a.is_active).map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="be-amount">Amount (₦)</label>
                <input id="be-amount" name="amount" type="number" min="0.01" step="0.01" className={inputCls} placeholder="0.00" required />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="be-method">Method</label>
                  <select id="be-method" name="method" className={inputCls} defaultValue="">
                    <option value="">—</option>
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="pos">POS</option>
                    <option value="card">Card</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="be-date">Date</label>
                  <input id="be-date" name="recordedAt" type="date" className={inputCls} defaultValue={new Date().toISOString().slice(0, 10)} />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="be-ref">Reference</label>
                <input id="be-ref" name="reference" className={inputCls} placeholder="e.g. Teller 0042" />
              </div>
              <div>
                <label className={labelCls} htmlFor="be-notes">Notes</label>
                <textarea id="be-notes" name="notes" rows={2} className={inputCls} placeholder="What is this for?" />
              </div>

              {error && (
                <p role="alert" className={errorBanner}>
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowEntry(false)} className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-muted-fg)]">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="focus-ring rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {busy ? "Saving…" : "Save entry"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Transfer modal */}
      {showTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Transfer between accounts">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowTransfer(false)} aria-label="Close" />
          <form onSubmit={saveTransfer} className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-[var(--shadow-xl)]">
            <div className="mb-4 flex items-center gap-2">
              <ArrowLeftRight size={18} className="text-[var(--color-primary)]" />
              <h2 className="text-base font-bold text-[var(--color-foreground)]">Transfer between accounts</h2>
            </div>

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="bt-from">From</label>
                  <select id="bt-from" name="fromAccount" className={inputCls} required defaultValue="cash">
                    {accounts.filter((a) => a.is_active).map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="bt-to">To</label>
                  <select id="bt-to" name="toAccount" className={inputCls} required>
                    {accounts.filter((a) => a.is_active).map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="bt-amount">Amount (₦)</label>
                <input id="bt-amount" name="amount" type="number" min="0.01" step="0.01" className={inputCls} placeholder="0.00" required />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="bt-method">Method</label>
                  <select id="bt-method" name="method" className={inputCls} defaultValue="">
                    <option value="">—</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="cash">Cash</option>
                    <option value="pos">POS</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="bt-date">Date</label>
                  <input id="bt-date" name="recordedAt" type="date" className={inputCls} defaultValue={new Date().toISOString().slice(0, 10)} />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="bt-notes">Notes</label>
                <textarea id="bt-notes" name="notes" rows={2} className={inputCls} placeholder="e.g. Daily cash sweep to bank" />
              </div>

              {error && (
                <p role="alert" className={errorBanner}>
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowTransfer(false)} className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-muted-fg)]">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="focus-ring rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {busy ? "Saving…" : "Transfer"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Opening balance modal */}
      {showOpening && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Set opening balance">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowOpening(null)} aria-label="Close" />
          <form onSubmit={saveOpening} className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-[var(--shadow-xl)]">
            <div className="mb-4 flex items-center gap-2">
              <Wallet size={18} className="text-[var(--color-primary)]" />
              <h2 className="text-base font-bold text-[var(--color-foreground)]">Opening balance — {showOpening.label}</h2>
            </div>

            <div className="space-y-4">
              <p className={mutedXs}>
                The money this account held before the ledger started. It is added to the balance and statements, but not counted as a period receipt.
                One opening balance per account — delete it from the transaction list to change it.
              </p>
              <div>
                <label className={labelCls} htmlFor="bo-amount">Amount (₦)</label>
                <input id="bo-amount" name="amount" type="number" min="0.01" step="0.01" className={inputCls} placeholder="0.00" required />
              </div>
              <div>
                <label className={labelCls} htmlFor="bo-date">Date</label>
                <input id="bo-date" name="recordedAt" type="date" className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="bo-notes">Notes</label>
                <input id="bo-notes" name="notes" className={inputCls} placeholder="Optional — e.g. Cash in drawer on 1 Aug" />
              </div>

              {error && (
                <p role="alert" className={errorBanner}>
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowOpening(null)} className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-muted-fg)]">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="focus-ring rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {busy ? "Saving…" : "Set opening balance"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Statement modal */}
      {stmtAccount && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label="Account statement">
          <button type="button" className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setStmtAccount(null)} aria-label="Close" />
          <div className="relative z-10 my-4 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-[var(--shadow-xl)]">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="mr-auto">
                <h2 className="flex items-center gap-2 text-base font-bold text-[var(--color-foreground)]">
                  <CalendarDays size={18} className="text-[var(--color-primary)]" /> Statement — {stmtAccount.label}
                </h2>
                <p className={mutedXs}>
                  {stmtAccount.account_name ? `${stmtAccount.account_name} · ••${stmtAccount.account_number?.slice(-4) ?? ""}` : "Hospital cash drawer"}
                </p>
              </div>
              <input
                type="month"
                value={stmtMonth}
                onChange={(e) => setStmtMonth(e.target.value)}
                className={inputCls + " w-auto"}
                aria-label="Statement month"
              />
              <button type="button" onClick={() => void statementCsv()} disabled={!stmt || stmt.rows.length === 0} className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-muted-fg)] disabled:opacity-50">
                CSV
              </button>
              <button type="button" onClick={() => void statementPrint()} disabled={!stmt || stmt.rows.length === 0} className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                <Printer size={14} /> Print
              </button>
            </div>

            {stmtLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 size={22} className="animate-spin text-[var(--color-muted-fg)]" />
              </div>
            ) : !stmt ? (
              <p className="py-12 text-center text-sm text-[var(--color-muted-fg)]">Could not load the statement.</p>
            ) : (
              <div className="space-y-6">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-[var(--color-border)] p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Opening</p>
                    <p className="mt-1 text-lg font-bold text-[var(--color-foreground)]">{naira(stmt.opening)}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Receipts</p>
                    <p className="mt-1 text-lg font-bold text-emerald-800">{naira(stmt.in)}</p>
                  </div>
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Payments</p>
                    <p className="mt-1 text-lg font-bold text-rose-800">{naira(stmt.out)}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Closing</p>
                    <p className="mt-1 text-lg font-bold text-[var(--color-foreground)]">{naira(stmt.closing)}</p>
                  </div>
                </div>

                {/* Reconciliation */}
                <div className="rounded-xl border border-[var(--color-border)] bg-slate-50/60 p-4">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-foreground)]">
                    <Scale size={15} className="text-[var(--color-primary)]" /> Reconciliation
                  </p>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <div className="w-56">
                      <label className={labelCls} htmlFor="rec-closing">Bank statement closing balance (₦)</label>
                      <input id="rec-closing" type="number" step="0.01" min="0" className={inputCls} value={bankClosing} onChange={(e) => setBankClosing(e.target.value)} placeholder={String(stmt.closing)} />
                    </div>
                    <div className="pb-1 text-sm">
                      {reconciliation === null && (
                        <p className="font-medium text-[var(--color-muted-fg)]">Enter the balance on the bank&apos;s own statement to compare.</p>
                      )}
                      {reconciliation && reconciliation.valid && (
                        <p className={`font-semibold ${reconciliation.balanced ? "text-emerald-700" : "text-amber-700"}`}>
                          {reconciliation.balanced
                            ? "Balanced — ledger matches the bank statement."
                            : `Difference of ${naira(Math.abs(reconciliation.diff))} ${reconciliation.diff > 0 ? "more in the ledger" : "more on the bank statement"}.`}
                        </p>
                      )}
                      {reconciliation && !reconciliation.valid && <p className="font-medium text-[var(--color-destructive)]">Enter a valid amount.</p>}
                    </div>
                  </div>
                </div>

                {/* Daily summary */}
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">Daily summary</h3>
                  <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
                    <table className={rowStart}>
                      <thead>
                        <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                          <th className="px-3 py-2 font-semibold">Day</th>
                          <th className="px-3 py-2 text-right font-semibold">Receipts</th>
                          <th className="px-3 py-2 text-right font-semibold">Payments</th>
                          <th className="px-3 py-2 text-right font-semibold">Closing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailySummary.length === 0 && (
                          <tr><td colSpan={4} className="px-3 py-6 text-center text-xs text-[var(--color-muted-fg)]">No activity this month.</td></tr>
                        )}
                        {dailySummary.map((d) => (
                          <tr key={d.date} className="border-b border-[var(--color-border)] last:border-0">
                            <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--color-muted-fg)]">
                              {new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-emerald-700">{d.in > 0 ? `+${naira(d.in)}` : "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-rose-700">{d.out > 0 ? `−${naira(d.out)}` : "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-[var(--color-foreground)]">{naira(d.closing)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Entry list */}
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">Entries ({stmt.rows.length})</h3>
                  <div className="max-h-80 overflow-y-auto rounded-lg border border-[var(--color-border)]">
                    <table className={rowStart}>
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                          <th className="px-3 py-2 font-semibold">Date</th>
                          <th className="px-3 py-2 font-semibold">Details</th>
                          <th className="px-3 py-2 text-right font-semibold">Amount</th>
                          <th className="px-3 py-2 text-right font-semibold">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stmt.rows.length === 0 && (
                          <tr><td colSpan={4} className="px-3 py-6 text-center text-xs text-[var(--color-muted-fg)]">No entries this month.</td></tr>
                        )}
                        {stmt.rows.map((r) => (
                          <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-slate-50">
                            <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--color-muted-fg)]">
                              {new Date(r.recorded_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                            </td>
                            <td className="px-3 py-2">
                              <p className="text-xs font-medium text-[var(--color-foreground)]">{SOURCE_LABELS[r.source] ?? r.source}</p>
                              <p className="max-w-56 truncate text-[11px] text-[var(--color-muted-fg)]">
                                {[r.source_ref, r.reference, r.notes].filter(Boolean).join(" · ") || "—"}
                              </p>
                            </td>
                            <td className={`whitespace-nowrap px-3 py-2 text-right text-xs font-semibold ${r.direction === "in" ? "text-emerald-700" : "text-rose-700"}`}>
                              {r.direction === "in" ? "+" : "−"}{naira(r.amount)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-[var(--color-foreground)]">{naira(r.running_balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}