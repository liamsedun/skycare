import { ArrowLeftRight, CalendarDays, Loader2, Printer, Scale, Wallet } from "lucide-react";
import { errorBanner, mutedXs, rowStart } from "@/lib/ui-constants";
import { inputCls, labelCls, naira, SOURCE_LABELS, type AccountCard, type StmtData } from "./banking-shared";

type FormSubmit = (e: React.FormEvent<HTMLFormElement>) => void;
type DailyRow = { date: string; in: number; out: number; closing: number };
type Reconciliation = { valid: false } | { valid: true; diff: number; balanced: boolean } | null;

export function EntryModal({ onClose, busy, error, accounts, onSubmit }: {
  onClose: () => void;
  busy: boolean;
  error: string | null;
  accounts: AccountCard[];
  onSubmit: FormSubmit;
}) {
  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Record banking entry">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
          <form onSubmit={onSubmit} className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-[var(--shadow-xl)]">
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
                <button type="button" onClick={onClose} className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-muted-fg)]">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="focus-ring rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {busy ? "Saving…" : "Save entry"}
                </button>
              </div>
            </div>
          </form>
        </div>
  );
}

export function TransferModal({ onClose, busy, error, accounts, onSubmit }: {
  onClose: () => void;
  busy: boolean;
  error: string | null;
  accounts: AccountCard[];
  onSubmit: FormSubmit;
}) {
  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Transfer between accounts">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
          <form onSubmit={onSubmit} className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-[var(--shadow-xl)]">
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
                <button type="button" onClick={onClose} className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-muted-fg)]">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="focus-ring rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {busy ? "Saving…" : "Transfer"}
                </button>
              </div>
            </div>
          </form>
        </div>
  );
}

export function OpeningModal({ account, onClose, busy, error, onSubmit }: {
  account: AccountCard;
  onClose: () => void;
  busy: boolean;
  error: string | null;
  onSubmit: FormSubmit;
}) {
  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Set opening balance">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
          <form onSubmit={onSubmit} className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-[var(--shadow-xl)]">
            <div className="mb-4 flex items-center gap-2">
              <Wallet size={18} className="text-[var(--color-primary)]" />
              <h2 className="text-base font-bold text-[var(--color-foreground)]">Opening balance — {account.label}</h2>
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
                <button type="button" onClick={onClose} className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-muted-fg)]">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="focus-ring rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {busy ? "Saving…" : "Set opening balance"}
                </button>
              </div>
            </div>
          </form>
        </div>
  );
}

export function StatementModal({ account, onClose, stmtMonth, onMonthChange, stmt, stmtLoading, dailySummary, bankClosing, onBankClosingChange, reconciliation, onCsv, onPrint }: {
  account: AccountCard;
  onClose: () => void;
  stmtMonth: string;
  onMonthChange: (v: string) => void;
  stmt: StmtData | null;
  stmtLoading: boolean;
  dailySummary: DailyRow[];
  bankClosing: string;
  onBankClosingChange: (v: string) => void;
  reconciliation: Reconciliation | null;
  onCsv: () => void;
  onPrint: () => void;
}) {
  return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label="Account statement">
          <button type="button" className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
          <div className="relative z-10 my-4 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-[var(--shadow-xl)]">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="mr-auto">
                <h2 className="flex items-center gap-2 text-base font-bold text-[var(--color-foreground)]">
                  <CalendarDays size={18} className="text-[var(--color-primary)]" /> Statement — {account.label}
                </h2>
                <p className={mutedXs}>
                  {account.account_name ? `${account.account_name} · ••${account.account_number?.slice(-4) ?? ""}` : "Hospital cash drawer"}
                </p>
              </div>
              <input
                type="month"
                value={stmtMonth}
                onChange={(e) => onMonthChange(e.target.value)}
                className={inputCls + " w-auto"}
                aria-label="Statement month"
              />
              <button type="button" onClick={onCsv} disabled={!stmt || stmt.rows.length === 0} className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-muted-fg)] disabled:opacity-50">
                CSV
              </button>
              <button type="button" onClick={onPrint} disabled={!stmt || stmt.rows.length === 0} className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
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
                      <input id="rec-closing" type="number" step="0.01" min="0" className={inputCls} value={bankClosing} onChange={(e) => onBankClosingChange(e.target.value)} placeholder={String(stmt.closing)} />
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
  );
}
