"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Loader2,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";

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

const SOURCE_LABELS: Record<string, string> = {
  payment: "Patient payment",
  lab: "Lab income",
  ward: "Ward income",
  other_income: "Other income",
  expense: "Expense",
  adjustment: "Manual entry",
  pharmacy: "Pharmacy",
};

export default function BankingView() {
  const [accounts, setAccounts] = useState<AccountCard[]>([]);
  const [recent, setRecent] = useState<LedgerItem[]>([]);
  const [monthTotals, setMonthTotals] = useState({ in: 0, out: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [showEntry, setShowEntry] = useState(false);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-foreground)]">Banking</h1>
          <p className="mt-0.5 text-sm text-[var(--color-muted-fg)]">
            Every receipt lands in Cash or a bank; every payment leaves from one. Banks added in Settings appear here automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowEntry(true)}
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Record entry
        </button>
      </header>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
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
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => setAccountFilter(accountFilter === acc.id ? "all" : acc.id)}
                  className={`focus-ring rounded-xl border p-4 text-left transition-colors duration-200 ${
                    accountFilter === acc.id
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                      : "border-[var(--color-border)] bg-white hover:bg-slate-50"
                  } ${acc.is_active ? "" : "opacity-60"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {acc.account_id ? <Landmark size={16} className="text-[var(--color-muted-fg)]" /> : <Banknote size={16} className="text-[var(--color-muted-fg)]" />}
                      <span className="text-sm font-semibold text-[var(--color-foreground)]">{acc.label}</span>
                    </div>
                    {!acc.is_active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">Inactive</span>}
                  </div>
                  <p className="mt-1 truncate text-xs text-[var(--color-muted-fg)]">
                    {acc.account_name ? `${acc.account_name} · ••${acc.account_number?.slice(-4) ?? ""}` : "Hospital cash drawer"}
                  </p>
                  <p className="mt-3 text-2xl font-bold text-[var(--color-foreground)]">{naira(acc.balance)}</p>
                  <p className="mt-1 text-xs text-[var(--color-muted-fg)]">
                    <span className="font-semibold text-emerald-700">+{naira(acc.month_in)}</span>
                    <span className="mx-1.5">·</span>
                    <span className="font-semibold text-rose-700">−{naira(acc.month_out)}</span>
                    <span className="ml-1">this month</span>
                  </p>
                </button>
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
            </div>

            {selectedAccount && accountFilter !== "all" && (
              <p className="mb-3 text-xs font-medium text-[var(--color-muted-fg)]">
                Showing <span className="font-semibold text-[var(--color-foreground)]">{selectedAccount.label}</span> transactions only.
              </p>
            )}

            <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
              {ledgerLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 size={20} className="animate-spin text-[var(--color-muted-fg)]" />
                </div>
              ) : ledger.length === 0 ? (
                <p className="py-12 text-center text-sm text-[var(--color-muted-fg)]">No transactions match these filters.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                      <th className="px-4 py-2.5 font-semibold">Date</th>
                      <th className="px-4 py-2.5 font-semibold">Details</th>
                      <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Account</th>
                      <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Method</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                      <th className="w-10 px-2 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((item) => (
                      <tr key={item.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">
                          {new Date(item.recorded_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-[var(--color-foreground)]">{SOURCE_LABELS[item.source] ?? item.source}</p>
                          <p className="truncate text-xs text-[var(--color-muted-fg)]">
                            {[item.source_ref, item.reference, item.notes].filter(Boolean).join(" · ") || "—"}
                          </p>
                          {item.source === "adjustment" && (
                            <button
                              type="button"
                              onClick={() => deleteEntry(item.id)}
                              disabled={busy}
                              className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-destructive)] hover:underline disabled:opacity-50"
                            >
                              <Trash2 size={10} /> Delete
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
                  <p className="text-xs text-[var(--color-muted-fg)]">
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
                <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
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
    </div>
  );
}