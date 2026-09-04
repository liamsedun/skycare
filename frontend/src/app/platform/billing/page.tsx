"use client";

import { useEffect, useState } from "react";
import { CreditCard, Plus, Loader2 } from "lucide-react";
import { formatNaira } from "@/lib/platform-utils";
import { PlatformGlassCard, PlatformPageHeader, StatusChip } from "@/components/platform/platform-mobile-ui";

interface Invoice {
  id: string; tenant_id: string; period_start: string; period_end: string;
  amount: number; discount_amount: number; status: string; currency: string;
  created_at: string; tenant: { name: string; slug: string; plan: string };
}

export default function PlatformBillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [tenants, setTenants] = useState<Array<{ id: string; name: string; plan: string }>>([]);
  const [form, setForm] = useState({ tenant_id: "", period_start: "", period_end: "", amount: "" });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const pageSize = 15;

  const loadInvoices = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (statusFilter) params.set("status", statusFilter);
    fetch(`/api/platform/invoices?${params}`, { credentials: "include" })
      .then(r => r.json()).then(d => { setInvoices(d.data || []); setTotal(d.meta?.total || 0); })
      .catch(() => setMessage("Failed to load invoices"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadInvoices(); }, [page, statusFilter]);
  useEffect(() => {
    fetch("/api/platform/tenants?pageSize=100", { credentials: "include" })
      .then(r => r.json()).then(d => setTenants(d.data?.map((t: { id: string; name: string; plan: string }) => ({ id: t.id, name: t.name, plan: t.plan })) || []))
      .catch(() => setTenants([]));
  }, []);
  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(""), 4000); return () => clearTimeout(t); }
  }, [message]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true); setMessage("");
    try {
      const res = await fetch("/api/platform/invoices", { credentials: "include", method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }) });
      const data = await res.json();
      if (data.success) { setMessage("Invoice created"); setShowCreate(false); setForm({ tenant_id: "", period_start: "", period_end: "", amount: "" }); loadInvoices(); }
      else setMessage(data.error || "Failed");
    } catch { setMessage("Network error"); } finally { setSubmitting(false); }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6 platform-stagger">
      <PlatformPageHeader title="Billing & Invoices" subtitle="Manage subscription invoices for all hospitals">
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 self-start platform-btn-gradient">
          <Plus className="h-4 w-4" /> Generate Invoice
        </button>
      </PlatformPageHeader>

      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm transition-all ${message.includes("Failed") || message.includes("error") ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"}`}>
          {message}
        </div>
      )}

      {showCreate && (
        <PlatformGlassCard>
        <form onSubmit={handleCreate}>
          <h3 className="mb-4 text-lg font-semibold">Generate Invoice</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-muted-fg)]">Hospital</label>
              <select value={form.tenant_id} onChange={e => setForm({ ...form, tenant_id: e.target.value })} required
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none">
                <option value="">Select hospital</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.plan})</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-muted-fg)]">Amount (NGN)</label>
              <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required min="1"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-muted-fg)]">Period Start</label>
              <input type="date" value={form.period_start} onChange={e => setForm({ ...form, period_start: e.target.value })} required
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-muted-fg)]">Period End</label>
              <input type="date" value={form.period_end} onChange={e => setForm({ ...form, period_end: e.target.value })} required
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-muted)]">Cancel</button>
            <button type="submit" disabled={submitting} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50 platform-btn-gradient">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Create Invoice
            </button>
          </div>
        </form>
        </PlatformGlassCard>
      )}

      <div className="flex items-center gap-4">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none">
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <PlatformGlassCard className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/30 text-left">
              <th className="px-4 py-3 font-medium">Hospital</th>
              <th className="px-4 py-3 font-medium">Period</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Discount</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-[var(--color-muted-fg)]"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-[var(--color-muted-fg)]">No invoices found</td></tr>
            ) : invoices.map(inv => (
              <tr key={inv.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-muted)]/20 platform-table-row">
                <td className="px-4 py-3">
                  <p className="font-medium">{inv.tenant?.name || "—"}</p>
                  <p className="text-xs text-[var(--color-muted-fg)]">{inv.tenant?.slug}.skycare.app</p>
                </td>
                <td className="px-4 py-3 text-xs">{new Date(inv.period_start).toLocaleDateString()} — {new Date(inv.period_end).toLocaleDateString()}</td>
                <td className="px-4 py-3 font-medium">{formatNaira(Number(inv.amount))}</td>
                <td className="px-4 py-3 text-xs text-emerald-600">{inv.discount_amount > 0 ? `-${formatNaira(Number(inv.discount_amount))}` : "—"}</td>
                <td className="px-4 py-3">
                  <StatusChip status={inv.status} />
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-muted-fg)]">{new Date(inv.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PlatformGlassCard>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--color-muted-fg)]">Page {page} of {totalPages} ({total} invoices)</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-[var(--color-muted)]">Previous</button>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-[var(--color-muted)]">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
