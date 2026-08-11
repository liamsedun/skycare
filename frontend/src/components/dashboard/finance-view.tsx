"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Calendar, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { ngn } from "@/lib/auth";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/expense-categories";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { downloadCsv, printTable } from "@/lib/export";

export type FinanceKind = "expense" | "income";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

const CATEGORY_LABELS: Record<string, string> = {
  utilities: "Utilities", rent: "Rent", salaries: "Salaries", medical_supplies: "Medical Supplies",
  equipment: "Equipment", maintenance: "Maintenance", transport: "Transport", staff_welfare: "Staff Welfare",
  training: "Training", donation: "Donation", food_sales: "Food Sales", drink_sales: "Drink Sales",
  drug_sales: "Drug Sales", consumables: "Consumables", other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  utilities: "bg-cyan-100 text-cyan-700", rent: "bg-violet-100 text-violet-700",
  salaries: "bg-blue-100 text-blue-700", medical_supplies: "bg-emerald-100 text-emerald-700",
  equipment: "bg-orange-100 text-orange-700", maintenance: "bg-rose-100 text-rose-700",
  transport: "bg-amber-100 text-amber-700", staff_welfare: "bg-pink-100 text-pink-700",
  training: "bg-indigo-100 text-indigo-700", donation: "bg-teal-100 text-teal-700",
  food_sales: "bg-lime-100 text-lime-700", drink_sales: "bg-yellow-100 text-yellow-700",
  drug_sales: "bg-fuchsia-100 text-fuchsia-700", consumables: "bg-slate-100 text-slate-700",
  other: "bg-gray-100 text-gray-600",
};

interface Tx {
  id: string;
  description: string;
  category: string;
  amount: number;
  expense_date?: string;
  income_date?: string;
  payment_method: string;
  vendor: string | null;
  source: string | null;
  notes: string | null;
}

interface TxForm {
  description: string;
  category: string;
  amount: string;
  date: string;
  paymentMethod: string;
  secondary: string;
  notes: string;
}

const PAYMENT_METHODS = ["cash", "card", "transfer", "mobile_money"];

export default function FinanceView({ kind }: { kind: FinanceKind }) {
  const isExpense = kind === "expense";
  const categories = isExpense ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const categoryList = Array.from(categories) as string[];

  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [rows, setRows] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [deleting, setDeleting] = useState<Tx | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<TxForm>(() => emptyForm(new Date().toISOString().slice(0, 10)));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [y, m] = month.split("-").map(Number);
      const from = `${y}-${String(m).padStart(2, "0")}-01`;
      const to = new Date(y, m, 0).toISOString().slice(0, 10);
      const res = await fetch(`/api/${isExpense ? "expenses" : "other-income"}?from=${from}&to=${to}&pageSize=100`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load records");
      setRows(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load records");
    } finally {
      setLoading(false);
    }
  }, [month, isExpense]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let items = rows;
    if (catFilter !== "all") items = items.filter((r) => r.category === catFilter);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((r) => r.description.toLowerCase().includes(q) || (r.vendor ?? r.source ?? "").toLowerCase().includes(q));
    }
    return items;
  }, [rows, catFilter, search]);

  const total = useMemo(() => filtered.reduce((s, r) => s + Number(r.amount), 0), [filtered]);
  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  }, [month]);

  function openEditor(tx: Tx | null) {
    setEditing(tx);
    setForm(tx ? {
      description: tx.description,
      category: tx.category,
      amount: String(tx.amount),
      date: (tx.expense_date ?? tx.income_date ?? "").slice(0, 10),
      paymentMethod: tx.payment_method || "cash",
      secondary: tx.vendor ?? tx.source ?? "",
      notes: tx.notes ?? "",
    } : emptyForm(new Date().toISOString().slice(0, 10)));
    setShowEditor(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const base = {
        description: form.description,
        category: form.category,
        amount: parseFloat(form.amount),
        paymentMethod: form.paymentMethod,
        notes: form.notes || null,
      };
      const body = isExpense
        ? { ...base, expenseDate: form.date, vendor: form.secondary || null }
        : { ...base, incomeDate: form.date, source: form.secondary || null };
      const res = await fetch(editing ? `/api/${isExpense ? "expenses" : "other-income"}/${editing.id}` : `/api/${isExpense ? "expenses" : "other-income"}`, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? {
          description: form.description,
          category: form.category,
          amount: parseFloat(form.amount),
          expense_date: form.date,
          income_date: form.date,
          payment_method: form.paymentMethod,
          vendor: form.secondary || null,
          source: form.secondary || null,
          notes: form.notes || null,
        } : body),
      });
      const resBody = await res.json();
      if (!res.ok) throw new Error(resBody.error ?? "Failed to save");
      setShowEditor(false);
      setEditing(null);
      await load();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/${isExpense ? "expenses" : "other-income"}/${deleting.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Delete failed");
      setDeleting(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const dateKey = isExpense ? "expense_date" : "income_date";

  const TX_COLUMNS = ["description", "category", "amount", "date", "payment_method", "vendor_or_source", "notes"];

  const txRows = () =>
    filtered.map((r) => [
      r.description,
      r.category,
      r.amount,
      (r.expense_date ?? r.income_date ?? "").slice(0, 10),
      r.payment_method,
      r.vendor ?? r.source ?? "",
      r.notes ?? "",
    ]);

  function exportCsv() {
    if (filtered.length === 0) { alert("Nothing to export — no records for this month."); return; }
    downloadCsv(`${isExpense ? "expenses" : "other-income"}-${month}.csv`, TX_COLUMNS, txRows());
  }

  function exportPdf() {
    if (filtered.length === 0) { alert("Nothing to export — no records for this month."); return; }
    printTable(isExpense ? "Expenses" : "Other Income", TX_COLUMNS, txRows());
  }

  async function importTx(rowsIn: string[][]): Promise<ImportResult> {
    const errors: string[] = [];
    let created = 0;
    for (let i = 0; i < rowsIn.length; i++) {
      const r = rowsIn[i]!;
      const description = String(r[0] ?? "").trim();
      const category = String(r[1] ?? "").trim();
      const amount = Number(r[2]);
      if (!description) { errors.push(`Row ${i + 1}: description is required`); continue; }
      if (!Number.isFinite(amount) || amount <= 0) { errors.push(`Row ${i + 1}: invalid amount "${r[2] ?? ""}"`); continue; }
      if (!(categories as readonly string[]).includes(category)) { errors.push(`Row ${i + 1}: unknown category "${category}"`); continue; }
      const base = {
        description,
        category,
        amount,
        paymentMethod: String(r[4] ?? "").trim() || "cash",
        notes: String(r[6] ?? "").trim() || null,
      };
      const body = isExpense
        ? { ...base, expenseDate: String(r[3] ?? "").trim() || undefined, vendor: String(r[5] ?? "").trim() || null }
        : { ...base, incomeDate: String(r[3] ?? "").trim() || undefined, source: String(r[5] ?? "").trim() || null };
      const res = await fetch(`/api/${isExpense ? "expenses" : "other-income"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const resBody = await res.json();
      if (!res.ok) errors.push(`Row ${i + 1}: ${resBody.error ?? "save failed"}`);
      else created++;
    }
    return { created, failed: errors.length, errors };
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
            {isExpense ? "Expenses" : "Other income"}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
            {isExpense ? "Track hospital operating expenses." : "Record non-invoice income such as donations and sales."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Calendar size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--color-primary)]"
              aria-label="Reporting period"
            />
          </div>
          <ImportExportMenu
            entityLabel={isExpense ? "Expenses" : "Other Income"}
            exportCsv={exportCsv}
            exportPdf={exportPdf}
            importColumns={TX_COLUMNS}
            importSample={[["Generator fuel", "utilities", "25000", "2026-08-11", "cash", "Total Filling Station", ""]]}
            templateFilename={`${isExpense ? "expenses" : "other-income"}-import-template.csv`}
            onImport={importTx}
            onImported={() => void load()}
          />
          <button
            type="button"
            onClick={() => openEditor(null)}
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]"
          >
            <Plus size={16} aria-hidden="true" /> Add {isExpense ? "expense" : "income"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: isExpense ? "Total expenses" : "Total income", value: ngn(total), tone: "text-[var(--color-foreground)]", icon: isExpense ? ArrowDownCircle : ArrowUpCircle },
          { label: "Entries", value: String(filtered.length), tone: "text-[var(--color-foreground)]", icon: isExpense ? ArrowDownCircle : ArrowUpCircle },
          { label: "Categories used", value: String(new Set(filtered.map((r) => r.category)).size), tone: "text-[var(--color-foreground)]", icon: isExpense ? ArrowDownCircle : ArrowUpCircle },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
              <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${isExpense ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>
                <Icon size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs text-[var(--color-muted-fg)]">{card.label} · {monthLabel}</p>
                <p className={`text-lg font-bold ${card.tone}`}>{card.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isExpense ? "Search expenses…" : "Search income…"}
            className={`${inputCls} pl-9`}
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className={inputCls + " w-auto"}
        >
          <option value="all">All categories</option>
          {categoryList.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} aria-hidden="true" className="animate-spin text-[var(--color-muted-fg)]" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">{isExpense ? "Vendor" : "Source"}</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-[var(--color-muted-fg)]">
                      No {isExpense ? "expenses" : "income"} found for {monthLabel}.
                    </td>
                  </tr>
                ) : filtered.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-muted)]/30">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--color-muted-fg)]">{r[dateKey]}</td>
                    <td className="px-4 py-3 font-medium text-[var(--color-foreground)]">{r.description}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${CATEGORY_COLORS[r.category] ?? "bg-gray-100 text-gray-600"}`}>
                        {CATEGORY_LABELS[r.category] ?? r.category}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${isExpense ? "text-rose-600" : "text-emerald-700"}`}>{ngn(Number(r.amount))}</td>
                    <td className="px-4 py-3 text-xs capitalize text-[var(--color-muted-fg)]">{r.payment_method}</td>
                    <td className="hidden px-4 py-3 text-xs text-[var(--color-muted-fg)] sm:table-cell">{r.vendor ?? r.source ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => openEditor(r)}
                          className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                          aria-label="Edit"
                        >
                          <Pencil size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(r)}
                          className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-destructive)] hover:bg-[var(--color-destructive-soft)]"
                          aria-label="Delete"
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <form onSubmit={save} className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--color-foreground)]">
                {editing ? `Edit ${isExpense ? "expense" : "income"}` : `Add ${isExpense ? "expense" : "income"}`}
              </h2>
              <button
                type="button"
                onClick={() => { setShowEditor(false); setEditing(null); }}
                className="focus-ring rounded-lg p-1 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelCls} htmlFor="fx-desc">Description *</label>
                <input id="fx-desc" required className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Electricity bill" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="fx-cat">Category *</label>
                  <select id="fx-cat" className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {categoryList.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="fx-amount">Amount (₦) *</label>
                  <input id="fx-amount" type="number" min={0} step="0.01" required className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="fx-date">Date *</label>
                  <input id="fx-date" type="date" required className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="fx-pm">Payment method</label>
                  <select id="fx-pm" className={inputCls} value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m} className="capitalize">{m.replace("_", " ")}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="fx-sec">{isExpense ? "Vendor" : "Source"} (optional)</label>
                <input id="fx-sec" className={inputCls} value={form.secondary} onChange={(e) => setForm({ ...form, secondary: e.target.value })} placeholder={isExpense ? "e.g. PHCN" : "e.g. Donation from charity"} />
              </div>
              <div>
                <label className={labelCls} htmlFor="fx-notes">Notes (optional)</label>
                <input id="fx-notes" className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything else worth recording" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowEditor(false); setEditing(null); }}
                className="focus-ring rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="focus-ring rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
              >
                {saving ? "Saving…" : editing ? "Save Changes" : `Add ${isExpense ? "Expense" : "Income"}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold text-[var(--color-foreground)]">Delete record</h2>
            <p className="mt-2 text-sm text-[var(--color-muted-fg)]">
              Delete <strong className="text-[var(--color-foreground)]">{deleting.description}</strong>? This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className="focus-ring rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busy}
                className="focus-ring rounded-lg bg-[var(--color-destructive)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function emptyForm(date: string): TxForm {
  return { description: "", category: "other", amount: "", date, paymentMethod: "cash", secondary: "", notes: "" };
}