"use client";

import { useEffect, useState } from "react";
import { Ticket, Plus, Edit2, Trash2, Eye, Search, X, Loader2 } from "lucide-react";
import { formatNaira } from "@/lib/platform-utils";
import { PlatformGlassCard, PlatformPageHeader, StatusChip, PlatformEmpty, PlatformSheet } from "@/components/platform/platform-mobile-ui";

interface Coupon {
  id: string; code: string; description: string; discount_type: string;
  discount_value: number; max_uses: number | null; used_count: number;
  applicable_plans: string[]; min_amount: number; expires_at: string | null;
  is_active: boolean; created_at: string;
  usage?: Array<{ id: string; tenant_id: string; discount_amount: number; used_at: string; tenant: { name: string } }>;
}

export default function PlatformCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [viewing, setViewing] = useState<Coupon | null>(null);
  const [form, setForm] = useState({ code: "", description: "", discount_type: "percent", discount_value: "", max_uses: "", applicable_plans: [] as string[], min_amount: "", expires_at: "" });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const loadCoupons = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    fetch(`/api/platform/coupons?${params}`, { credentials: "include" })
      .then(r => r.json()).then(d => setCoupons(d.data || []))
      .catch(() => setMessage("Failed to load coupons"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCoupons(); }, []);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(""), 4000);
      return () => clearTimeout(t);
    }
  }, [message]);

  const resetForm = () => { setForm({ code: "", description: "", discount_type: "percent", discount_value: "", max_uses: "", applicable_plans: [], min_amount: "", expires_at: "" }); setEditing(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setMessage("");
    try {
      const url = editing ? `/api/platform/coupons/${editing.id}` : "/api/platform/coupons";
      const res = await fetch(url, { credentials: "include", method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, discount_value: Number(form.discount_value), max_uses: form.max_uses ? Number(form.max_uses) : null, min_amount: form.min_amount ? Number(form.min_amount) : 0 }),
      });
      const data = await res.json();
      if (data.success) { setMessage(editing ? "Coupon updated" : "Coupon created"); setShowCreate(false); resetForm(); loadCoupons(); }
      else setMessage(data.error || "Failed");
    } catch { setMessage("Network error"); } finally { setSubmitting(false); }
  };

  const handleEdit = (coupon: Coupon) => {
    setForm({ code: coupon.code, description: coupon.description || "", discount_type: coupon.discount_type, discount_value: String(coupon.discount_value), max_uses: coupon.max_uses ? String(coupon.max_uses) : "", applicable_plans: coupon.applicable_plans || [], min_amount: coupon.min_amount ? String(coupon.min_amount) : "", expires_at: coupon.expires_at ? coupon.expires_at.slice(0, 10) : "" });
    setEditing(coupon); setShowCreate(true);
  };

  const handleDelete = async (coupon: Coupon) => {
    if (!confirm(`Delete coupon "${coupon.code}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/platform/coupons/${coupon.id}`, { credentials: "include", method: "DELETE" });
      const data = await res.json();
      if (data.success) { setMessage("Coupon deleted"); loadCoupons(); } else setMessage(data.error || "Delete failed");
    } catch { setMessage("Network error"); }
  };

  const toggleActive = async (coupon: Coupon) => {
    try {
      const res = await fetch(`/api/platform/coupons/${coupon.id}`, { credentials: "include", method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !coupon.is_active }) });
      const data = await res.json();
      if (data.success) { setMessage(coupon.is_active ? "Coupon deactivated" : "Coupon activated"); loadCoupons(); }
    } catch { setMessage("Network error"); }
  };

  const viewCoupon = async (coupon: Coupon) => {
    const res = await fetch(`/api/platform/coupons/${coupon.id}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) setViewing(data.data);
  };

  return (
    <div className="space-y-6 platform-stagger">
      <PlatformPageHeader title="Coupon Management" subtitle="Create and manage discount coupons for hospitals">
        <button onClick={() => { resetForm(); setShowCreate(!showCreate); }} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 self-start platform-btn-gradient">
          <Plus className="h-4 w-4" /> Create Coupon
        </button>
      </PlatformPageHeader>

      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm transition-all ${message.includes("Failed") || message.includes("error") ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"}`}>
          {message}
        </div>
      )}

      {showCreate && (
        <PlatformGlassCard>
        <form onSubmit={handleSubmit}>
          <h3 className="mb-4 text-lg font-semibold">{editing ? "Edit Coupon" : "Create Coupon"}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-muted-fg)]">Code *</label>
              <input type="text" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} required placeholder="e.g. SAVE20"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm font-mono uppercase focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-muted-fg)]">Description</label>
              <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g. 20% off for new hospitals"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-muted-fg)]">Discount Type *</label>
              <select value={form.discount_type} onChange={e => setForm({ ...form, discount_type: e.target.value })}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all">
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed Amount (NGN)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-muted-fg)]">Discount Value *</label>
              <input type="number" value={form.discount_value} onChange={e => setForm({ ...form, discount_value: e.target.value })} required min="0.01" max={form.discount_type === "percent" ? "100" : undefined}
                placeholder={form.discount_type === "percent" ? "e.g. 20" : "e.g. 5000"}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-muted-fg)]">Max Uses</label>
              <input type="number" value={form.max_uses} onChange={e => setForm({ ...form, max_uses: e.target.value })} min="1" placeholder="Unlimited"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-muted-fg)]">Min Amount (NGN)</label>
              <input type="number" value={form.min_amount} onChange={e => setForm({ ...form, min_amount: e.target.value })} min="0" placeholder="0"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-muted-fg)]">Expires At</label>
              <input type="date" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-muted-fg)]">Applicable Plans</label>
              <div className="flex flex-wrap gap-2">
                {["basic", "pro", "enterprise", "custom"].map(plan => (
                  <label key={plan} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={form.applicable_plans.includes(plan)}
                      onChange={e => setForm({ ...form, applicable_plans: e.target.checked ? [...form.applicable_plans, plan] : form.applicable_plans.filter(p => p !== plan) })}
                      className="rounded border-[var(--color-border)] text-indigo-600" />
                    <span className="text-sm capitalize">{plan}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-[var(--color-muted-fg)]">Leave empty for all plans</p>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" onClick={() => { setShowCreate(false); resetForm(); }} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-muted)]">Cancel</button>
            <button type="submit" disabled={submitting} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50 platform-btn-gradient">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Update" : "Create"}
            </button>
          </div>
        </form>
        </PlatformGlassCard>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-fg)]" />
          <input type="text" placeholder="Search coupons..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && loadCoupons()}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] py-2.5 pl-10 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" />
        </div>
        <button onClick={loadCoupons} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-muted)]">Search</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-fg)]" /></div>
      ) : coupons.length === 0 ? (
        <PlatformEmpty
          icon={<Ticket className="h-6 w-6" />}
          title="No coupons found"
          hint="Create a coupon to offer discounts to hospitals"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {coupons.map(c => (
            <PlatformGlassCard key={c.id} hover className={!c.is_active ? "opacity-60" : ""}>
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <span className="font-mono text-lg font-bold text-indigo-600">{c.code}</span>
                  {c.description && <p className="mt-1 text-sm text-[var(--color-muted-fg)]">{c.description}</p>}
                </div>
                <StatusChip status={c.is_active ? "active" : "inactive"} />
              </div>
              <div className="mb-4 space-y-1 text-sm text-[var(--color-muted-fg)]">
                <p><span className="font-medium text-[var(--color-foreground)]">{c.discount_type === "percent" ? `${c.discount_value}%` : formatNaira(c.discount_value)}</span> off
                  {c.min_amount > 0 && <span className="opacity-60"> (min {formatNaira(c.min_amount)})</span>}</p>
                <p>Used {c.used_count}{c.max_uses ? ` / ${c.max_uses}` : ""} times</p>
                {c.expires_at && <p className="opacity-60">Expires {new Date(c.expires_at).toLocaleDateString()}</p>}
                {c.applicable_plans.length > 0 && <p className="opacity-60">Plans: {c.applicable_plans.join(", ")}</p>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => viewCoupon(c)} className="rounded-lg bg-[var(--color-muted)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--color-muted)]/80"><Eye className="mr-1 inline h-3 w-3" />View</button>
                <button onClick={() => handleEdit(c)} className="rounded-lg bg-[var(--color-muted)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--color-muted)]/80"><Edit2 className="mr-1 inline h-3 w-3" />Edit</button>
                <button onClick={() => toggleActive(c)} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${c.is_active ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
                  {c.is_active ? "Deactivate" : "Activate"}
                </button>
                <button onClick={() => handleDelete(c)} className="rounded-lg bg-red-100 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"><Trash2 className="mr-1 inline h-3 w-3" />Delete</button>
              </div>
            </PlatformGlassCard>
          ))}
        </div>
      )}

      <PlatformSheet open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `Coupon: ${viewing.code}` : ""}>
        {viewing && (
          <>
            <div className="mb-4 space-y-1 text-sm text-[var(--color-muted-fg)]">
              <p>{viewing.discount_type === "percent" ? `${viewing.discount_value}%` : formatNaira(viewing.discount_value)} off</p>
              <p>Used {viewing.used_count}{viewing.max_uses ? ` / ${viewing.max_uses}` : ""} times</p>
            </div>
            {viewing.usage && viewing.usage.length > 0 ? (
              <div className="space-y-2">
                {viewing.usage.map(u => (
                  <div key={u.id} className="flex items-center justify-between rounded-lg bg-[var(--color-muted)]/30 px-4 py-3">
                    <div>
                      <p className="font-medium">{u.tenant?.name || "Unknown"}</p>
                      <p className="text-xs text-[var(--color-muted-fg)]">{new Date(u.used_at).toLocaleDateString()}</p>
                    </div>
                    <span className="text-sm font-medium text-emerald-600">{formatNaira(Number(u.discount_amount))} saved</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-[var(--color-muted-fg)]">No usage recorded yet</p>
            )}
          </>
        )}
      </PlatformSheet>
    </div>
  );
}
