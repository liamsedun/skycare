"use client";

import { useCallback, useEffect, useState } from "react";
import { Landmark, Loader2, Plus, Trash2 } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

interface BankAccount {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  is_active: boolean;
}

export default function BankAccountsSection() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/bank-accounts", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load bank accounts");
      setAccounts(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bank accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankName, accountName, accountNumber }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to add account");
      setBankName("");
      setAccountName("");
      setAccountNumber("");
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add account");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(acc: BankAccount) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/bank-accounts/${acc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !acc.is_active }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update account");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update account");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/bank-accounts/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete account");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Landmark size={16} aria-hidden="true" className="text-[var(--color-muted-fg)]" />
          <h2 className="text-sm font-semibold text-[var(--color-foreground)]">Bank accounts</h2>
        </div>
        {!showForm && accounts.length < 5 && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-foreground)] hover:bg-slate-50"
          >
            <Plus size={13} /> Add account
          </button>
        )}
      </header>

      <div className="space-y-3 p-4">
        {error && (
          <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={18} aria-hidden="true" className="animate-spin text-[var(--color-muted-fg)]" />
          </div>
        ) : accounts.length === 0 && !showForm ? (
          <p className="py-4 text-center text-sm text-[var(--color-muted-fg)]">No bank accounts yet. Add one so patients can declare payments into it.</p>
        ) : (
          <ul className="space-y-2">
            {accounts.map((acc) => (
              <li key={acc.id} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${acc.is_active ? "border-[var(--color-border)]" : "border-[var(--color-border)] opacity-60"}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">
                    {acc.bank_name} {!acc.is_active && <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Inactive</span>}
                  </p>
                  <p className="truncate text-xs text-[var(--color-muted-fg)]">
                    {acc.account_name} · {acc.account_number}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggle(acc)}
                    disabled={busy}
                    className={`focus-ring rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${acc.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                  >
                    {acc.is_active ? "Active" : "Pause"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(acc.id)}
                    disabled={busy}
                    className="focus-ring rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-rose-50 hover:text-[var(--color-destructive)] disabled:opacity-50"
                    aria-label={`Delete ${acc.bank_name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {showForm && (
          <form onSubmit={add} className="grid gap-3 rounded-lg border border-dashed border-[var(--color-border)] p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <div>
              <label className={labelCls} htmlFor="ba-bank">Bank</label>
              <input id="ba-bank" className={inputCls} value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Zenith Bank" required />
            </div>
            <div>
              <label className={labelCls} htmlFor="ba-name">Account name</label>
              <input id="ba-name" className={inputCls} value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="e.g. SkyCare Hospital Ltd" required />
            </div>
            <div>
              <label className={labelCls} htmlFor="ba-number">Account number</label>
              <input id="ba-number" className={inputCls} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10 digits" required />
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" disabled={busy} className="focus-ring rounded-lg bg-[var(--color-primary)] px-3 py-2.5 text-sm font-medium text-white disabled:opacity-60">
                {busy ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm font-medium text-[var(--color-muted-fg)] hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}