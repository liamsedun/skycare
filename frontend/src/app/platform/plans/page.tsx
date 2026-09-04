"use client";

import { useEffect, useState } from "react";
import {
  Plus, Crown, Star, Edit2, Trash2, Users, HardDrive,
  Building2, Stethoscope, Loader2, X, ChevronDown, ChevronRight,
  Check,
} from "lucide-react";
import { formatNaira } from "@/lib/platform-utils";
import { PlatformGlassCard, PlatformPageHeader, StatusChip, PlatformEmpty } from "@/components/platform/platform-mobile-ui"; import PlatformModal from "@/components/platform/platform-modal";

/* ── Module categories and keys ── */
const MODULE_CATEGORIES = [
  {
    label: "Clinical",
    modules: [
      { key: "overview", name: "Overview" },
      { key: "appointments", name: "Appointments" },
      { key: "patients", name: "Patients" },
      { key: "pharmacy", name: "Pharmacy" },
      { key: "lab", name: "Lab" },
      { key: "wards", name: "Wards" },
    ],
  },
  {
    label: "Financial",
    modules: [
      { key: "billing", name: "Billing" },
      { key: "banking", name: "Banking" },
      { key: "expenses", name: "Expenses" },
      { key: "other_income", name: "Other Income" },
    ],
  },
  {
    label: "HR & Staff",
    modules: [
      { key: "staff", name: "Staff" },
      { key: "leave", name: "Leave" },
      { key: "hr", name: "HR" },
      { key: "payroll", name: "Payroll" },
    ],
  },
  {
    label: "Communication",
    modules: [
      { key: "mail", name: "Mail" },
      { key: "chats", name: "Chats" },
    ],
  },
  {
    label: "Reports",
    modules: [
      { key: "medical_reports", name: "Medical Reports" },
      { key: "financial_reports", name: "Financial Reports" },
    ],
  },
  {
    label: "Administration",
    modules: [
      { key: "audit_logs", name: "Audit Logs" },
      { key: "account", name: "Account" },
      { key: "subscription", name: "Subscription" },
      { key: "settings", name: "Settings" },
    ],
  },
  {
    label: "Patient Portal",
    modules: [
      { key: "download_app", name: "Download App" },
      { key: "profile", name: "Profile" },
    ],
  },
  {
    label: "Enterprise & Premium",
    modules: [
      { key: "multi_branch", name: "Multi-branch Hospitals" },
      { key: "nhia_insurance", name: "NHIA / Insurance / HMO Integrations" },
      { key: "custom_workflows", name: "Custom Workflows" },
      { key: "dedicated_account_manager", name: "Dedicated Account Manager" },
      { key: "on_premise", name: "On-Premise Option" },
      { key: "ai_features", name: "AI Features" },
      { key: "full_customization", name: "Full Customization" },
      { key: "private_cloud", name: "On-Premise / Private Cloud" },
      { key: "national_deployments", name: "National-Scale Deployments" },
      { key: "training_migration", name: "Training & Migration" },
      { key: "support_24_7", name: "24/7 Dedicated Support" },
    ],
  },
];

const ALL_MODULE_KEYS = MODULE_CATEGORIES.flatMap((c) => c.modules.map((m) => m.key));

interface Plan {
  id: string; name: string; code: string; description: string;
  monthly_price: number; annual_price: number; currency: string;
  trial_days: number; user_limit: number; storage_limit_gb: number;
  patient_limit: number; branch_limit: number; modules: string[];
  popular_badge: boolean; recommended_badge: boolean; ribbon_color: string | null;
  button_text: string; sort_order: number; is_active: boolean; is_public: boolean;
  created_at: string;
}

const defaultForm: Partial<Plan> = {
  name: "", code: "", description: "", monthly_price: 0, annual_price: 0,
  currency: "NGN", trial_days: 14, user_limit: 5, storage_limit_gb: 5,
  patient_limit: 500, branch_limit: 1, modules: [], popular_badge: false,
  recommended_badge: false, ribbon_color: "", button_text: "Subscribe",
  sort_order: 0, is_active: true, is_public: true,
};

function getModuleName(key: string): string {
  for (const cat of MODULE_CATEGORIES) {
    const found = cat.modules.find((m) => m.key === key);
    if (found) return found.name;
  }
  return key;
}

function getCategoryForModule(key: string): string {
  for (const cat of MODULE_CATEGORIES) {
    if (cat.modules.some((m) => m.key === key)) return cat.label;
  }
  return "Other";
}

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState<Partial<Plan>>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(
    Object.fromEntries(MODULE_CATEGORIES.map((c) => [c.label, true]))
  );

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/plans", { credentials: "include" });
      const d = await res.json();
      setPlans(d.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm(defaultForm); setShowModal(true); setFeaturesOpen(true); }
  function openEdit(p: Plan) {
    setEditing(p);
    setForm({ ...p, modules: p.modules || [], ribbon_color: p.ribbon_color || "" });
    setShowModal(true);
    setFeaturesOpen(true);
  }

  function toggleModule(key: string) {
    const current = form.modules || [];
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    setForm({ ...form, modules: next });
  }

  function selectAllModules() { setForm({ ...form, modules: [...ALL_MODULE_KEYS] }); }
  function deselectAllModules() { setForm({ ...form, modules: [] }); }

  function toggleCategory(label: string) {
    const cat = MODULE_CATEGORIES.find((c) => c.label === label);
    if (!cat) return;
    const catKeys = cat.modules.map((m) => m.key);
    const current = form.modules || [];
    const allSelected = catKeys.every((k) => current.includes(k));
    const next = allSelected
      ? current.filter((k) => !catKeys.includes(k))
      : [...new Set([...current, ...catKeys])];
    setForm({ ...form, modules: next });
  }

  function toggleCategoryExpand(label: string) {
    setExpandedCategories((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const method = editing ? "PUT" : "POST";
      const url = editing ? `/api/platform/plans/${editing.id}` : "/api/platform/plans";
      const res = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) { setShowModal(false); load(); }
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Deactivate this plan?")) return;
    await fetch(`/api/platform/plans/${id}`, { method: "DELETE", credentials: "include" });
    load();
  }

  function limitLabel(n: number) { return n === 0 ? "Unlimited" : n.toLocaleString(); }

  function modulesByCategory(modules: string[]) {
    const grouped: { category: string; items: string[] }[] = [];
    for (const cat of MODULE_CATEGORIES) {
      const items = modules.filter((m) => cat.modules.some((cm) => cm.key === m));
      if (items.length > 0) grouped.push({ category: cat.label, items });
    }
    const known = new Set(MODULE_CATEGORIES.flatMap((c) => c.modules.map((m) => m.key)));
    const other = modules.filter((m) => !known.has(m));
    if (other.length > 0) grouped.push({ category: "Other", items: other });
    return grouped;
  }

  return (
    <div className="space-y-6">
      <PlatformPageHeader title="Subscription Plans" subtitle="Define plans available for hospital tenants">
        <button onClick={openNew} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 transition-all platform-btn-gradient">
          <Plus className="h-4 w-4" /> New Plan
        </button>
      </PlatformPageHeader>

      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[0,1,2].map(i => <PlatformGlassCard key={i} className="h-64" />)}
        </div>
      ) : plans.length === 0 ? (
        <PlatformGlassCard>
          <PlatformEmpty icon={<Crown className="h-7 w-7" />} title="No plans yet" hint="Create your first subscription plan" />
        </PlatformGlassCard>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <PlatformGlassCard key={p.id} hover className={`platform-card-glow flex flex-col ${!p.is_active ? "opacity-60" : ""}`}
              style={p.ribbon_color ? { borderTop: `4px solid ${p.ribbon_color}` } : undefined}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold">{p.name}</h3>
                  <span className="mt-0.5 inline-block rounded-lg bg-[var(--color-muted)] px-2 py-0.5 text-xs font-mono text-[var(--color-muted-fg)]">{p.code}</span>
                </div>
                <div className="flex gap-1">
                  {p.popular_badge && <span className="rounded-lg bg-amber-100 dark:bg-amber-500/15 p-1.5 text-amber-600 dark:text-amber-400"><Crown className="h-3.5 w-3.5" /></span>}
                  {p.recommended_badge && <span className="rounded-lg bg-emerald-100 dark:bg-emerald-500/15 p-1.5 text-emerald-600 dark:text-emerald-400"><Star className="h-3.5 w-3.5" /></span>}
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight">{formatNaira(p.monthly_price)}</span>
                <span className="text-sm text-[var(--color-muted-fg)]">/mo</span>
              </div>
              <div className="text-sm text-[var(--color-muted-fg)]">{formatNaira(p.annual_price)}/yr</div>
              {p.description && <p className="mt-2 line-clamp-2 text-sm text-[var(--color-muted-fg)]">{p.description}</p>}
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[var(--color-muted-fg)]">
                <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {limitLabel(p.user_limit)} users</div>
                <div className="flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5" /> {limitLabel(p.storage_limit_gb)} GB</div>
                <div className="flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> {limitLabel(p.patient_limit)} patients</div>
                <div className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> {limitLabel(p.branch_limit)} branches</div>
              </div>
              {p.trial_days > 0 && <div className="mt-3"><StatusChip status="trial" label={`${p.trial_days}-day trial`} /></div>}
              {p.modules && p.modules.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {modulesByCategory(p.modules).map((g) => (
                    <div key={g.category}>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-fg)]">{g.category}</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {g.items.map((m) => (
                          <span key={m} className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                            <Check className="h-2.5 w-2.5" /> {getModuleName(m)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {(!p.modules || p.modules.length === 0) && (
                <div className="mt-3 text-xs text-[var(--color-muted-fg)] italic">No modules selected</div>
              )}
              <div className="mt-auto pt-4 flex items-center justify-between border-t border-[var(--color-border)]">
                <div className="flex gap-1">
                  <button onClick={() => openEdit(p)} className="rounded-xl p-2 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)] transition-all hover:scale-105 active:scale-95"><Edit2 className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(p.id)} className="rounded-xl p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all hover:scale-105 active:scale-95"><Trash2 className="h-4 w-4" /></button>
                </div>
                <StatusChip status={p.is_active ? "active" : "inactive"} />
              </div>
            </PlatformGlassCard>
          ))}
        </div>
      )}

      <PlatformModal open={showModal} onClose={() => setShowModal(false)} maxWidth="max-w-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-4 mb-5">
          <h2 className="text-lg font-bold">{editing ? "Edit Plan" : "New Plan"}</h2>
          <button onClick={() => setShowModal(false)} className="rounded-xl p-2 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"><X className="h-5 w-5" /></button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto space-y-5 pr-1">
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted-fg)]">Plan Name</label>
              <input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted-fg)]">Code</label>
              <input value={form.code || ""} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!editing}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-mono disabled:opacity-50 focus:border-sky-500 focus:outline-none transition-all" />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted-fg)]">Description</label>
            <textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-sky-500 focus:outline-none transition-all" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted-fg)]">Monthly Price (₦)</label>
              <input type="number" value={form.monthly_price || 0} onChange={(e) => setForm({ ...form, monthly_price: Number(e.target.value) })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-sky-500 focus:outline-none transition-all" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted-fg)]">Annual Price (₦)</label>
              <input type="number" value={form.annual_price || 0} onChange={(e) => setForm({ ...form, annual_price: Number(e.target.value) })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-sky-500 focus:outline-none transition-all" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted-fg)]">Trial Days</label>
              <input type="number" value={form.trial_days || 0} onChange={(e) => setForm({ ...form, trial_days: Number(e.target.value) })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-sky-500 focus:outline-none transition-all" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted-fg)]">Users</label>
              <input type="number" value={form.user_limit || 0} onChange={(e) => setForm({ ...form, user_limit: Number(e.target.value) })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-sky-500 focus:outline-none transition-all" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted-fg)]">Storage (GB)</label>
              <input type="number" value={form.storage_limit_gb || 0} onChange={(e) => setForm({ ...form, storage_limit_gb: Number(e.target.value) })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-sky-500 focus:outline-none transition-all" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted-fg)]">Patients</label>
              <input type="number" value={form.patient_limit || 0} onChange={(e) => setForm({ ...form, patient_limit: Number(e.target.value) })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-sky-500 focus:outline-none transition-all" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted-fg)]">Branches</label>
              <input type="number" value={form.branch_limit || 0} onChange={(e) => setForm({ ...form, branch_limit: Number(e.target.value) })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-sky-500 focus:outline-none transition-all" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted-fg)]">Button Text</label>
              <input value={form.button_text || "Subscribe"} onChange={(e) => setForm({ ...form, button_text: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-sky-500 focus:outline-none transition-all" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-muted-fg)]">Ribbon Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.ribbon_color || "#6366f1"} onChange={(e) => setForm({ ...form, ribbon_color: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded-lg border border-[var(--color-border)] p-0.5" />
                <span className="text-xs text-[var(--color-muted-fg)] font-mono">{form.ribbon_color || "#6366f1"}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 rounded-lg bg-[var(--color-muted)] px-3 py-2.5">
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={!!form.popular_badge} onChange={(e) => setForm({ ...form, popular_badge: e.target.checked })} className="rounded accent-sky-500" /> Popular</label>
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={!!form.recommended_badge} onChange={(e) => setForm({ ...form, recommended_badge: e.target.checked })} className="rounded accent-sky-500" /> Recommended</label>
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded accent-sky-500" /> Active</label>
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={!!form.is_public} onChange={(e) => setForm({ ...form, is_public: e.target.checked })} className="rounded accent-sky-500" /> Public</label>
          </div>

          {/* ── Features & Modules selector ── */}
          <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
            <button type="button" onClick={() => setFeaturesOpen((v) => !v)}
              className="flex w-full items-center justify-between bg-[var(--color-muted)] px-4 py-3 text-sm font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/80 transition-colors">
              <span className="flex items-center gap-2">
                Features & Modules
                <span className="rounded-full bg-sky-100 dark:bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-400">
                  {(form.modules || []).length} / {ALL_MODULE_KEYS.length}
                </span>
              </span>
              {featuresOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>

            {featuresOpen && (
              <div className="p-4 space-y-3">
                <div className="flex gap-2">
                  <button type="button" onClick={selectAllModules}
                    className="rounded-lg border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-700 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-colors">
                    Select All
                  </button>
                  <button type="button" onClick={deselectAllModules}
                    className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)] transition-colors">
                    Deselect All
                  </button>
                </div>

                {MODULE_CATEGORIES.map((cat) => {
                  const catKeys = cat.modules.map((m) => m.key);
                  const selectedCount = catKeys.filter((k) => (form.modules || []).includes(k)).length;
                  const allSelected = selectedCount === catKeys.length;
                  const someSelected = selectedCount > 0 && !allSelected;
                  const expanded = expandedCategories[cat.label] !== false;

                  return (
                    <div key={cat.label} className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                      <div className="flex items-center gap-2 bg-[var(--color-muted)]/50 px-3 py-2">
                        <button type="button" onClick={() => toggleCategoryExpand(cat.label)}
                          className="text-[var(--color-muted-fg)] hover:text-[var(--color-foreground)]">
                          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                        <label className="flex items-center gap-2 cursor-pointer flex-1 text-sm font-medium">
                          <input type="checkbox"
                            checked={allSelected}
                            ref={(el) => { if (el) el.indeterminate = someSelected; }}
                            onChange={() => toggleCategory(cat.label)}
                            className="rounded accent-sky-500" />
                          {cat.label}
                        </label>
                        <span className="text-[11px] text-[var(--color-muted-fg)]">{selectedCount}/{catKeys.length}</span>
                      </div>
                      {expanded && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 p-3">
                          {cat.modules.map((m) => (
                            <label key={m.key} className="flex items-center gap-2 cursor-pointer text-sm text-[var(--color-foreground)] hover:text-sky-600 transition-colors">
                              <input type="checkbox"
                                checked={(form.modules || []).includes(m.key)}
                                onChange={() => toggleModule(m.key)}
                                className="rounded accent-sky-500" />
                              {m.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-[var(--color-border)] pt-4 mt-4">
          <button onClick={() => setShowModal(false)} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-muted)] transition-all">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.name || !form.code}
            className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 transition-all platform-btn-gradient">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? "Save Changes" : "Create Plan"}
          </button>
        </div>
      </PlatformModal>
    </div>
  );
}
