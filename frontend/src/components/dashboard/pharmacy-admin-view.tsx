"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pill, Building2, Tag, Upload, Search, Plus, Trash2, X, Pencil, CheckCircle2,
  AlertTriangle, Download, Archive, Package, Store, MapPin, Phone as PhoneIcon, Mail,
} from "lucide-react";
import { FORM_OPTIONS } from "@/lib/pharmacy-admin";
import PharmacyStockView from "@/components/dashboard/pharmacy-stock-view";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";
import FilterBar from "@/components/filters/filter-bar";
import type { AccessLevel } from "@/lib/nav";

// ============================================================================
// Pharmacy Admin — catalogue administration for hospital admins:
//   Drugs     : search / add / edit / archive catalogue entries
//   Suppliers : add local vendors
//   Prices    : branch-specific retail price overrides
//   Import    : CSV bulk upload with row-by-row report
// ============================================================================

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const btnPrimary =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60";
const btnGhost =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-slate-50 disabled:opacity-60";
const ngn = (v: number | null | undefined) => `₦${Number(v ?? 0).toLocaleString()}`;

type Tab = "stock" | "drugs" | "suppliers" | "branches" | "prices" | "import";

const TABS: Array<{ id: Tab; label: string; icon: typeof Pill }> = [
  { id: "stock", label: "Stock", icon: Package },
  { id: "drugs", label: "Drugs", icon: Pill },
  { id: "suppliers", label: "Suppliers", icon: Building2 },
  { id: "branches", label: "Branches", icon: Store },
  { id: "prices", label: "Branch prices", icon: Tag },
  { id: "import", label: "Bulk import", icon: Upload },
];

export default function PharmacyAdminView() {
  const [tab, setTab] = useState<Tab>("drugs");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-foreground)]">Pharmacy administration</h2>
          <p className="mt-0.5 text-sm text-[var(--color-muted-fg)]">Catalogue, suppliers, branch pricing and bulk import.</p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Admin section">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors duration-200 ${
                tab === t.id ? "bg-[var(--color-primary)] text-white" : "border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-slate-50"
              }`}
            >
              <t.icon size={14} aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "stock" && <PharmacyStockView />}
      {tab === "drugs" && <DrugsTab />}
      {tab === "suppliers" && <SuppliersTab />}
      {tab === "branches" && <BranchesTab />}
      {tab === "prices" && <PricesTab />}
      {tab === "import" && <ImportTab />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-sm)]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone === "warn" ? "text-amber-600" : "text-[var(--color-foreground)]"}`}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DRUGS TAB
// ---------------------------------------------------------------------------
export interface DrugRow {
  id: string;
  name: string;
  genericName: string | null;
  brand: string | null;
  category: string;
  form: string;
  dosage: string | null;
  sku: string | null;
  wholesalePrice: number;
  unitPrice: number;
  effectivePrice: number;
  reorderLevel: number;
  reorderQty: number;
  requiresRx: boolean;
  isControlled: boolean;
  nafdacNumber: string | null;
  isActive: boolean;
  supplierId: string | null;
  stock: number;
}

export interface CategoryRow { id: string; name: string; color: string | null; isPlatform: boolean }

export function DrugsTab() {
  const [rows, setRows] = useState<DrugRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: true; drug: DrugRow | null } | { open: false }>({ open: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (search) params.set("search", search);
      if (catFilter) params.set("category", catFilter);
      if (includeInactive) params.set("includeInactive", "1");
      const res = await fetch(`/api/pharmacy/admin/drugs?${params.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (res.ok) {
        setRows(body.data ?? []);
        setTotal(body.meta?.total ?? 0);
      }
    } catch {
      /* non-critical */
    } finally {
      setLoading(false);
    }
  }, [page, search, catFilter, includeInactive]);

  useEffect(() => {
    const t = setTimeout(() => load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    (async () => {
      const [sRes, cRes] = await Promise.all([
        fetch("/api/pharmacy/admin/summary", { cache: "no-store" }),
        fetch("/api/pharmacy/admin/categories", { cache: "no-store" }),
      ]);
      if (sRes.ok) setSummary((await sRes.json()).data);
      if (cRes.ok) setCategories((await cRes.json()).data ?? []);
    })();
  }, []);

  const afterEdit = () => { setModal({ open: false }); load(); };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Catalogue entries" value={summary?.drugs ?? "—"} />
        <Stat label="Active" value={summary?.activeDrugs ?? "—"} />
        <Stat label="Low stock" value={summary?.lowStock ?? "—"} tone={(summary?.lowStock ?? 0) > 0 ? "warn" : "ok"} />
        <Stat label="Categories" value={summary?.categories ?? "—"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name, generic, brand or SKU…"
            className={`${inputCls} pl-9`}
          />
        </div>
        <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setPage(1); }} className={`${inputCls} w-auto`}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>{c.name}{c.isPlatform ? "" : " (custom)"}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted-fg)]">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} className="accent-[var(--color-primary)]" />
          Show archived
        </label>
        <button type="button" onClick={() => setModal({ open: true, drug: null })} className={btnPrimary}>
          <Plus size={14} aria-hidden="true" /> Add drug
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
              <th scope="col" className="px-4 py-2.5 font-semibold">Drug</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Category</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Stock</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Retail</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Effective</th>
              <th scope="col" className="px-4 py-2.5 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">No drugs found.</td></tr>
            ) : (
              rows.map((d) => (
                <tr key={d.id} className={d.isActive ? "" : "opacity-50"}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-[var(--color-foreground)]">{d.name}</p>
                    <p className="text-xs text-[var(--color-muted-fg)]">
                      {[d.form, d.dosage].filter(Boolean).join(" · ")}
                      {d.genericName ? ` · ${d.genericName}` : ""}
                      {d.isControlled && (
                        <span className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold uppercase text-red-700">controlled</span>
                      )}
                      {!d.isActive && <span className="ml-1 rounded bg-slate-200 px-1 py-0.5 text-[9px] font-bold uppercase text-slate-600">archived</span>}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{d.category}</td>
                  <td className="px-4 py-2.5">
                    <span className={`font-semibold ${d.stock <= d.reorderLevel ? "text-amber-600" : "text-emerald-600"}`}>{d.stock}</span>
                    <span className="text-xs text-[var(--color-muted-fg)]"> / min {d.reorderLevel}</span>
                  </td>
                  <td className="px-4 py-2.5">{ngn(d.unitPrice)}</td>
                  <td className="px-4 py-2.5">
                    {d.effectivePrice !== d.unitPrice ? (
                      <span className="font-semibold text-[var(--color-primary)]">{ngn(d.effectivePrice)}</span>
                    ) : (
                      <span className="text-[var(--color-muted-fg)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => setModal({ open: true, drug: d })} className={btnGhost}>
                        <Pencil size={13} aria-hidden="true" /> Edit
                      </button>
                      <button
                        type="button"
                        title={d.isActive ? "Archive" : "Restore"}
                        onClick={async () => {
                          await fetch(`/api/pharmacy/admin/drugs/${d.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ isActive: !d.isActive }),
                          });
                          load();
                        }}
                        className={btnGhost}
                      >
                        <Archive size={13} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-[var(--color-muted-fg)]">
        <span>{total} drug(s)</span>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={btnGhost}>Previous</button>
          <button type="button" disabled={rows.length < 20} onClick={() => setPage((p) => p + 1)} className={btnGhost}>Next</button>
        </div>
      </div>

      {modal.open && (
        <DrugFormModal drug={modal.drug} categories={categories} onClose={() => setModal({ open: false })} onSaved={afterEdit} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DRUG FORM MODAL (add + edit)
// ---------------------------------------------------------------------------
interface DrugFormState {
  name: string;
  genericName: string;
  brand: string;
  category: string;
  form: string;
  dosage: string;
  sku: string;
  wholesalePrice: string;
  unitPrice: string;
  reorderLevel: string;
  reorderQty: string;
  requiresRx: boolean;
  isControlled: boolean;
  nafdacNumber: string;
  supplierId: string;
}

export function DrugFormModal({ drug, categories, onClose, onSaved }: { drug: DrugRow | null; categories: CategoryRow[]; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<DrugFormState>(
    drug
      ? {
          name: drug.name,
          genericName: drug.genericName ?? "",
          brand: drug.brand ?? "",
          category: drug.category,
          form: drug.form,
          dosage: drug.dosage ?? "",
          sku: drug.sku ?? "",
          wholesalePrice: String(drug.wholesalePrice ?? ""),
          unitPrice: String(drug.unitPrice ?? ""),
          reorderLevel: String(drug.reorderLevel ?? 10),
          reorderQty: String(drug.reorderQty ?? 100),
          requiresRx: drug.requiresRx,
          isControlled: drug.isControlled,
          nafdacNumber: drug.nafdacNumber ?? "",
          supplierId: drug.supplierId ?? "",
        }
      : { name: "", genericName: "", brand: "", category: categories.find((c) => c.isPlatform)?.name ?? "", form: "tablet", dosage: "", sku: "", wholesalePrice: "", unitPrice: "", reorderLevel: "10", reorderQty: "100", requiresRx: true, isControlled: false, nafdacNumber: "", supplierId: "" }
  );

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);

  useEffect(() => {
    fetch("/api/pharmacy/admin/suppliers", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((b) => setSuppliers((b.data ?? []) as SupplierRow[]))
      .catch(() => setSuppliers([]));
  }, []);

  const set = (k: keyof DrugFormState, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        genericName: form.genericName.trim() || null,
        brand: form.brand.trim() || null,
        category: form.category.trim(),
        form: form.form,
        dosage: form.dosage.trim() || null,
        sku: form.sku.trim() || null,
        wholesalePrice: Number(form.wholesalePrice) || 0,
        unitPrice: Number(form.unitPrice) || 0,
        reorderLevel: Number(form.reorderLevel) || 10,
        reorderQty: Number(form.reorderQty) || 100,
        requiresRx: form.requiresRx,
        isControlled: form.isControlled,
        nafdacNumber: form.nafdacNumber.trim() || null,
        supplierId: form.supplierId.trim() || null,
      };
      const res = await fetch(drug ? `/api/pharmacy/admin/drugs/${drug.id}` : "/api/pharmacy/admin/drugs", {
        method: drug ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const field = "mb-3";
  const lbl = "mb-1 block text-xs font-medium text-[var(--color-foreground)]";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{drug ? "Edit drug" : "Add drug"}</h3>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <div className={field}>
            <label className={lbl} htmlFor="ad-name">Name *</label>
            <input id="ad-name" value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} placeholder="e.g. Vitamin C 500mg Tablets x30" />
          </div>
          <div className={field}>
            <label className={lbl} htmlFor="ad-cat">Category *</label>
            <input id="ad-cat" list="ad-cats" value={form.category} onChange={(e) => set("category", e.target.value)} className={inputCls} />
            <datalist id="ad-cats">
              {categories.map((c) => <option key={c.id} value={c.name} />)}
            </datalist>
            <p className="mt-1 text-[10px] text-[var(--color-muted-fg)]">Type a new category to create it.</p>
          </div>
          <div className={field}>
            <label className={lbl} htmlFor="ad-form">Form *</label>
            <select id="ad-form" value={form.form} onChange={(e) => set("form", e.target.value)} className={inputCls}>
              {FORM_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className={field}>
            <label className={lbl} htmlFor="ad-dose">Dosage</label>
            <input id="ad-dose" value={form.dosage} onChange={(e) => set("dosage", e.target.value)} className={inputCls} placeholder="625mg" />
          </div>
          <div className={field}>
            <label className={lbl} htmlFor="ad-gen">Generic name</label>
            <input id="ad-gen" value={form.genericName} onChange={(e) => set("genericName", e.target.value)} className={inputCls} />
          </div>
          <div className={field}>
            <label className={lbl} htmlFor="ad-brand">Brand</label>
            <input id="ad-brand" value={form.brand} onChange={(e) => set("brand", e.target.value)} className={inputCls} />
          </div>
          <div className={field}>
            <label className={lbl} htmlFor="ad-sku">SKU</label>
            <input id="ad-sku" value={form.sku} onChange={(e) => set("sku", e.target.value)} className={inputCls} />
          </div>
          <div className={field}>
            <label className={lbl} htmlFor="ad-naf">NAFDAC number</label>
            <input id="ad-naf" value={form.nafdacNumber} onChange={(e) => set("nafdacNumber", e.target.value)} className={inputCls} />
          </div>
          <div className={field}>
            <label className={lbl} htmlFor="ad-supplier">Primary supplier</label>
            <select id="ad-supplier" value={form.supplierId} onChange={(e) => set("supplierId", e.target.value)} className={inputCls}>
              <option value="">— None —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-[var(--color-muted-fg)]">
              Tags this drug to a supplier — it then pins to the top of the New purchase order list and appears in the import template.
            </p>
          </div>
          <div className={field}>
            <label className={lbl} htmlFor="ad-wholesale">Wholesale (₦)</label>
            <input id="ad-wholesale" type="number" min={0} value={form.wholesalePrice} onChange={(e) => set("wholesalePrice", e.target.value)} className={inputCls} />
          </div>
          <div className={field}>
            <label className={lbl} htmlFor="ad-price">Retail price (₦)</label>
            <input id="ad-price" type="number" min={0} value={form.unitPrice} onChange={(e) => set("unitPrice", e.target.value)} className={inputCls} />
          </div>
          <div className={field}>
            <label className={lbl} htmlFor="ad-reorder">Reorder level</label>
            <input id="ad-reorder" type="number" min={0} value={form.reorderLevel} onChange={(e) => set("reorderLevel", e.target.value)} className={inputCls} />
          </div>
          <div className={field}>
            <label className={lbl} htmlFor="ad-reorderq">Reorder qty</label>
            <input id="ad-reorderq" type="number" min={0} value={form.reorderQty} onChange={(e) => set("reorderQty", e.target.value)} className={inputCls} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.requiresRx} onChange={(e) => set("requiresRx", e.target.checked)} className="accent-[var(--color-primary)]" />
            Requires prescription
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isControlled} onChange={(e) => set("isControlled", e.target.checked)} className="accent-[var(--color-primary)]" />
            Controlled drug
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>
        )}

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onClose} className={btnGhost + " flex-1 justify-center py-2.5"}>Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className={btnPrimary + " flex-1 justify-center py-2.5"}>
            {busy ? "Saving…" : drug ? "Save changes" : "Add drug"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SUPPLIERS TAB
// ---------------------------------------------------------------------------
interface SupplierRow {
  id: string;
  name: string;
  code: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  nafdacLicense: string | null;
  paymentTerms: string | null;
  isActive: boolean;
  createdAt: string | null;
}

export function SuppliersTab({ viewOnly = false }: { viewOnly?: boolean }) {
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [modal, setModal] = useState<{ open: true; supplier: SupplierRow | null } | { open: false }>({ open: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pharmacy/admin/suppliers?includeInactive=1", { cache: "no-store" });
      if (res.ok) setRows((await res.json()).data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const afterSave = () => { setModal({ open: false }); void load(); };

  const visible = rows.filter((s) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.code ?? "").toLowerCase().includes(q) ||
      (s.contactPerson ?? "").toLowerCase().includes(q) ||
      (s.email ?? "").toLowerCase().includes(q) ||
      (s.nafdacLicense ?? "").toLowerCase().includes(q);
    return matchesSearch && inDateRange(s.createdAt, from, to);
  });

  const SUPPLIER_COLUMNS = ["name", "code", "contactPerson", "phone", "email", "address", "nafdacLicense", "paymentTerms"];

  const supplierRows = () =>
    visible.map((s) => [
      s.name,
      s.code ?? "",
      s.contactPerson ?? "",
      s.phone ?? "",
      s.email ?? "",
      s.address ?? "",
      s.nafdacLicense ?? "",
      s.paymentTerms ?? "",
    ]);

  function exportCsv() {
    if (visible.length === 0) { alert("Nothing to export — there are no suppliers yet."); return; }
    downloadCsv(`suppliers-${dateStamp()}.csv`, SUPPLIER_COLUMNS, supplierRows());
  }

  function exportPdf() {
    if (visible.length === 0) { alert("Nothing to export — there are no suppliers yet."); return; }
    printTable("Suppliers & Procurement", SUPPLIER_COLUMNS, supplierRows());
  }

  async function importSuppliers(rowsIn: string[][]): Promise<ImportResult> {
    const errors: string[] = [];
    let created = 0;
    for (let i = 0; i < rowsIn.length; i++) {
      const r = rowsIn[i]!;
      if (!String(r[0] ?? "").trim()) { errors.push(`Row ${i + 1}: supplier name is required`); continue; }
      const res = await fetch("/api/pharmacy/admin/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(r[0]).trim(),
          code: String(r[1] ?? "").trim() || undefined,
          contactPerson: String(r[2] ?? "").trim() || undefined,
          phone: String(r[3] ?? "").trim() || undefined,
          email: String(r[4] ?? "").trim() || undefined,
          address: String(r[5] ?? "").trim() || undefined,
          nafdacLicense: String(r[6] ?? "").trim() || undefined,
          paymentTerms: String(r[7] ?? "").trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) errors.push(`Row ${i + 1}: ${body.error ?? "save failed"}`);
      else created++;
    }
    return { created, failed: errors.length, errors };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar
          query={search}
          onQueryChange={setSearch}
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          onClear={() => { setSearch(""); setFrom(""); setTo(""); }}
          searchPlaceholder="Search name, code, contact…"
          searchWidth={240}
        />
        <div className="flex flex-wrap items-center gap-2">
          <ImportExportMenu
            entityLabel="Suppliers"
            exportCsv={exportCsv}
            exportPdf={exportPdf}
            importColumns={SUPPLIER_COLUMNS}
            importSample={[["Emzor Chemists", "EMZ-01", "Bisi Adeyemi", "0803 555 1234", "sales@emzor.example", "14 Alaba Rd, Lagos", "NAFDAC-4451", "net 30"]]}
            templateFilename="suppliers-import-template.csv"
            onImport={importSuppliers}
            onImported={() => void load()}
            allowImport={!viewOnly}
          />
          {!viewOnly && (
          <button type="button" onClick={() => setModal({ open: true, supplier: null })} className={btnPrimary}>
            <Plus size={14} aria-hidden="true" /> Add supplier
          </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
              <th scope="col" className="px-4 py-2.5 font-semibold">Supplier</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Contact</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Phone</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">NAFDAC</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Terms</th>
              <th scope="col" className="px-4 py-2.5 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">No suppliers match these filters.</td></tr>
            ) : (
              visible.map((s) => (
                <tr key={s.id} className={s.isActive ? "" : "opacity-50"}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-[var(--color-foreground)]">{s.name}</p>
                    {s.code && <p className="text-xs text-[var(--color-muted-fg)]">{s.code}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">
                    {[s.contactPerson, s.email].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{s.phone ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{s.nafdacLicense ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{s.paymentTerms ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      {!viewOnly && (
                      <>
                      <button type="button" onClick={() => setModal({ open: true, supplier: s })} className={btnGhost}>
                        <Pencil size={13} aria-hidden="true" /> Edit
                      </button>
                      <button
                        type="button"
                        title={s.isActive ? "Archive" : "Restore"}
                        onClick={async () => {
                          await fetch(`/api/pharmacy/admin/suppliers/${s.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ isActive: !s.isActive }),
                          });
                          void load();
                        }}
                        className={btnGhost}
                      >
                        <Archive size={13} aria-hidden="true" />
                      </button>
                      </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal.open && <SupplierFormModal supplier={modal.supplier} onClose={() => setModal({ open: false })} onSaved={afterSave} />}
    </div>
  );
}

function SupplierFormModal({ supplier, onClose, onSaved }: { supplier: SupplierRow | null; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: supplier?.name ?? "",
    code: supplier?.code ?? "",
    contactPerson: supplier?.contactPerson ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    address: supplier?.address ?? "",
    nafdacLicense: supplier?.nafdacLicense ?? "",
    paymentTerms: supplier?.paymentTerms ?? "net 30",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const lbl = "mb-1 block text-xs font-medium text-[var(--color-foreground)]";

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(supplier ? `/api/pharmacy/admin/suppliers/${supplier.id}` : "/api/pharmacy/admin/suppliers", {
        method: supplier ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{supplier ? "Edit supplier" : "Add supplier"}</h3>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              ["name", "Name *", "Emzor Pharmaceuticals"],
              ["code", "Code", "EMZ-001"],
              ["contactPerson", "Contact person", "Chukwuemeka Okeke"],
              ["phone", "Phone", "+234 800 000 0000"],
              ["email", "Email", "sales@example.com"],
              ["address", "Address", "Lagos"],
              ["nafdacLicense", "NAFDAC licence", "NAFDAC-XX-000000"],
              ["paymentTerms", "Payment terms", "net 30"],
            ] as Array<[keyof typeof form, string, string]>
          ).map(([k, label, ph]) => (
            <div key={k} className={k === "address" || k === "nafdacLicense" ? "sm:col-span-2" : ""}>
              <label className={lbl} htmlFor={`sp-${k}`}>{label}</label>
              <input id={`sp-${k}`} value={form[k]} onChange={(e) => set(k, e.target.value)} placeholder={ph} className={inputCls} />
            </div>
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>
        )}
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onClose} className={btnGhost + " flex-1 justify-center py-2.5"}>Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className={btnPrimary + " flex-1 justify-center py-2.5"}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PRICES TAB (multi-branch overrides)
// ---------------------------------------------------------------------------
interface OverrideRow {
  id: string;
  drugId: string;
  drugName: string;
  branchId: string | null;
  branchName: string;
  unitPrice: number;
  note: string | null;
}
interface BranchRow { id: string; name: string; code: string | null; isMain: boolean; isActive: boolean }
interface DrugOption { id: string; name: string; dosage: string | null; category: string; unitPrice: number }

export function PricesTab({ viewOnly = false }: { viewOnly?: boolean }) {
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<DrugOption[]>([]);
  const [open, setOpen] = useState(false);
  const [drugId, setDrugId] = useState<string | null>(null);
  const [drugName, setDrugName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOverrides = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pharmacy/admin/prices", { cache: "no-store" });
      if (res.ok) setOverrides((await res.json()).data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverrides();
    (async () => {
      const res = await fetch("/api/pharmacy/admin/branches", { cache: "no-store" });
      if (res.ok) setBranches((await res.json()).data ?? []);
    })();
  }, [loadOverrides]);

  useEffect(() => {
    if (search.trim().length < 2) { setResults([]); setOpen(false); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/pharmacy/drugs?query=${encodeURIComponent(search)}`, { cache: "no-store" });
      if (res.ok) { setResults((await res.json()).data ?? []); setOpen(true); }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (!drugId) throw new Error("Pick a drug first");
      const res = await fetch("/api/pharmacy/admin/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drugId, branchId: branchId || null, unitPrice: Number(price), note: note || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      setPrice("");
      setNote("");
      setDrugId(null);
      setDrugName("");
      await loadOverrides();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const lbl = "mb-1 block text-xs font-medium text-[var(--color-foreground)]";

  return (
    <div className={`grid gap-5 ${viewOnly ? "lg:grid-cols-1" : "lg:grid-cols-2"}`}>
      {!viewOnly && (
      <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <h3 className="text-sm font-bold text-[var(--color-foreground)]">Set a branch price</h3>
        <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
          Applies an override for one branch — leave branch on “All branches” for a base price used everywhere else.
        </p>

        <div className="relative mt-4">
          <label className={lbl} htmlFor="pr-search">Drug</label>
          <div className="relative">
            <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-[var(--color-muted-fg)]" />
            <input
              id="pr-search"
              value={drugName || search}
              onChange={(e) => { setSearch(e.target.value); setDrugId(null); setDrugName(""); }}
              onFocus={() => { if (search.trim().length >= 2) setOpen(true); }}
              placeholder="Search the catalogue…"
              className={`${inputCls} pl-9`}
            />
          </div>
          {open && results.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white shadow-lg">
              {results.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => { setDrugId(d.id); setDrugName(d.name); setSearch(""); setOpen(false); }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-primary-soft)]"
                  >
                    <span className="block font-medium">{d.name}</span>
                    <span className="block text-xs text-[var(--color-muted-fg)]">
                      {[d.dosage, d.category].filter(Boolean).join(" · ")} · {ngn(d.unitPrice)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3">
          <label className={lbl} htmlFor="pr-branch">Branch</label>
          <select id="pr-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.isMain ? " (main)" : ""}</option>)}
          </select>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={lbl} htmlFor="pr-price">Price (₦)</label>
            <input id="pr-price" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={lbl} htmlFor="pr-note">Note</label>
            <input id="pr-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="optional" />
          </div>
        </div>

        {error && <p role="alert" className="mt-3 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>}

        <button type="button" onClick={save} disabled={busy || !drugId} className={btnPrimary + " mt-4"}>
          <Tag size={14} aria-hidden="true" /> {busy ? "Saving…" : "Save override"}
        </button>
      </div>
      )}

      <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <h3 className="text-sm font-bold text-[var(--color-foreground)]">Active overrides</h3>
        {loading ? (
          <p className="py-6 text-center text-xs text-[var(--color-muted-fg)]">Loading…</p>
        ) : overrides.length === 0 ? (
          <div className="py-6 text-center">
            <CheckCircle2 size={28} aria-hidden="true" className="mx-auto text-emerald-500" />
            <p className="mt-2 text-xs text-[var(--color-muted-fg)]">No overrides yet — all branches use the retail price.</p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {overrides.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--color-foreground)]">{o.drugName}</p>
                  <p className="text-xs text-[var(--color-muted-fg)]">
                    {o.branchName}{o.note ? ` · ${o.note}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-semibold text-[var(--color-primary)]">{ngn(o.unitPrice)}</span>
                  {!viewOnly && (
                  <button
                    type="button"
                    className="focus-ring rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-red-50 hover:text-red-600"
                    aria-label="Remove override"
                    onClick={async () => {
                      await fetch(`/api/pharmacy/admin/prices/${o.id}`, { method: "DELETE" });
                      await loadOverrides();
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// IMPORT TAB
// ---------------------------------------------------------------------------
interface ImportReport {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number | null; reason: string }>;
}

export function ImportTab() {
  const [csv, setCsv] = useState("");
  const [defaultCategory, setDefaultCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<"replace" | "keep" | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const TEMPLATE = `name,category,form,generic_name,brand,dosage,sku,wholesale_price,unit_price,reorder_level,reorder_qty,requires_rx,nafdac_number,supplier
"Vitamin C 500mg Tablets x30","Vitamins & Supplements",tablet,"Vitamin C",Generic,"500mg","VC30",1200,1800,20,100,false,,"Emzor Pharmaceutical Industries Limited"
"Amoxiclav 400mg Syrup 60ml","Antibiotics",syrup,"Amoxicillin/Clavulanic Acid",Generic,"400mg/5ml",,2500,3800,15,50,true,,"Fidson Healthcare Plc"`;

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pharmacy-drugs-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function postImport(payload: Record<string, unknown>) {
    const res = await fetch("/api/pharmacy/admin/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Import failed");
    return body.data;
  }

  // 1) dry-run: count drugs that already exist so we can ask before replacing
  async function run() {
    setBusy(true);
    setError(null);
    try {
      if (!csv.trim()) throw new Error("Paste your CSV or choose a file");
      const pre = await postImport({ csv, dryRun: true, defaultCategory: defaultCategory.trim() || undefined });
      if (pre.existing > 0) {
        setPendingConfirm(pre.existing);
        return;
      }
      const data = await postImport({ csv, conflictAction: "replace", defaultCategory: defaultCategory.trim() || undefined });
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  // 2) the user chose how to handle existing drugs — perform the real import
  async function doImport(action: "replace" | "keep") {
    setPendingConfirm(null);
    setConfirming(action);
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const data = await postImport({ csv, conflictAction: action, defaultCategory: defaultCategory.trim() || undefined });
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  const lbl = "mb-1 block text-xs font-medium text-[var(--color-foreground)]";

  return (
    <>
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--color-foreground)]">Upload catalogue</h3>
          <button type="button" onClick={downloadTemplate} className={btnGhost}>
            <Download size={13} aria-hidden="true" /> Template
          </button>
        </div>
        <p className="mt-1 text-xs text-[var(--color-muted-fg)]">
          Columns: <code className="rounded bg-slate-100 px-1">name*, category*, form*</code>, generic_name, brand, dosage, sku, wholesale_price, unit_price, reorder_level, reorder_qty, requires_rx, nafdac_number, <code className="rounded bg-slate-100 px-1">supplier</code> (optional — the supplier&apos;s exact name; it must already exist on the Suppliers tab). Max 1000 rows.
        </p>

        <div className="mt-4">
          <label className={lbl} htmlFor="imp-csv">CSV content</label>
          <textarea
            id="imp-csv"
            rows={8}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={"name,category,form,unit_price\nArtemether 20/120mg,Antimalarials,tablet,1500"}
            className={inputCls + " font-mono text-xs"}
          />
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="mt-2 hidden" />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className={btnGhost}>
              <Upload size={13} aria-hidden="true" /> Choose .csv file
            </button>
            <span className="text-xs text-[var(--color-muted-fg)]">
              If some drugs already exist you&apos;ll be asked whether to replace them.
            </span>
          </div>

          <div className="mt-3">
            <label className={lbl} htmlFor="imp-cat">Default category (rows without a category)</label>
            <input id="imp-cat" value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)} className={inputCls} placeholder="General" />
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>
        )}

        <button type="button" onClick={run} disabled={busy || !csv.trim()} className={btnPrimary + " mt-4"}>
          <Upload size={14} aria-hidden="true" /> {busy ? "Uploading…" : "Import"}
        </button>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <h3 className="text-sm font-bold text-[var(--color-foreground)]">Import report</h3>
        {!report && !error && (
          <p className="py-8 text-center text-xs text-[var(--color-muted-fg)]">
            Run an import to see a per-row report (created / updated / errors).
          </p>
        )}
        {report && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-center">
                <p className="text-lg font-bold text-emerald-700">{report.created}</p>
                <p className="text-[10px] font-semibold uppercase text-emerald-600">Created</p>
              </div>
              <div className="rounded-lg bg-sky-50 px-3 py-2 text-center">
                <p className="text-lg font-bold text-sky-700">{report.updated}</p>
                <p className="text-[10px] font-semibold uppercase text-sky-600">Updated</p>
              </div>
              <div className={`rounded-lg px-3 py-2 text-center ${report.errors.length > 0 ? "bg-red-50" : "bg-slate-50"}`}>
                <p className={`text-lg font-bold ${report.errors.length > 0 ? "text-red-700" : "text-slate-600"}`}>{report.errors.length}</p>
                <p className="text-[10px] font-semibold uppercase text-[var(--color-muted-fg)]">Errors</p>
              </div>
            </div>
            {report.errors.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-red-100 bg-red-50/50 p-2">
                <p className="flex items-center gap-1 px-1 pb-1 text-xs font-bold text-red-700">
                  <AlertTriangle size={12} aria-hidden="true" /> Row issues
                </p>
                <ul className="space-y-0.5">
                  {report.errors.slice(0, 60).map((e: { row: number | null; reason: string }, i: number) => (
                    <li key={i} className="px-1 text-xs text-red-700">
                      Row {e.row || "—"}: {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[11px] text-[var(--color-muted-fg)]">{report.total} row(s) processed · {report.skipped} skipped.</p>
          </div>
        )}
      </div>
    </div>

      {pendingConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-xl">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
              <div>
                <h4 className="text-sm font-bold text-[var(--color-foreground)]">Existing drugs found</h4>
                <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
                  <span className="font-semibold text-[var(--color-foreground)]">{pendingConfirm}</span> of the drug(s) in
                  this file already exist in the catalogue.
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-[var(--color-muted-fg)]">
              Replace them with the values from this file, or skip them and only add the new drugs?
            </p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setPendingConfirm(null)} className={btnGhost}>
                Cancel
              </button>
              <button type="button" onClick={() => void doImport("keep")} disabled={confirming !== null} className={btnGhost}>
                {confirming === "keep" ? "Importing…" : "Keep existing (add new only)"}
              </button>
              <button type="button" onClick={() => void doImport("replace")} disabled={confirming !== null} className={btnPrimary}>
                {confirming === "replace" ? "Replacing…" : "Replace them"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// BRANCHES TAB
// ---------------------------------------------------------------------------
// Branch administration (prices + branch manager) lives on /app/pharmacy/prices
// — admin-gated, and the natural home for everything branch-related.
export function BranchAdminTabs({ accessLevel = "full", myRole }: { accessLevel?: AccessLevel; myRole?: string }) {
  const viewOnly = accessLevel === "view_only";
  const [tab, setTab] = useState<"prices" | "branches">("prices");

  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="group" aria-label="Branch administration">
        <button
          type="button"
          onClick={() => setTab("prices")}
          aria-pressed={tab === "prices"}
          className={`focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors duration-200 ${
            tab === "prices" ? "bg-[var(--color-primary)] text-white" : "border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-slate-50"
          }`}
        >
          <Tag size={14} aria-hidden="true" /> Branch prices
        </button>
        <button
          type="button"
          onClick={() => setTab("branches")}
          aria-pressed={tab === "branches"}
          className={`focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors duration-200 ${
            tab === "branches" ? "bg-[var(--color-primary)] text-white" : "border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-slate-50"
          }`}
        >
          <Store size={14} aria-hidden="true" /> Branches
        </button>
      </div>
      {tab === "prices" ? <PricesTab viewOnly={viewOnly} /> : <BranchesTab viewOnly={viewOnly} />}
    </div>
  );
}

interface BranchRow {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  isMain: boolean;
  isActive: boolean;
}

export function BranchesTab({ viewOnly = false }: { viewOnly?: boolean }) {
  const [rows, setRows] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<{ open: true; branch: BranchRow | null } | { open: false }>({ open: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pharmacy/admin/branches", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load branches");
      setRows(body.data ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load branches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(form: FormData) {
    const payload: Record<string, unknown> = { name: String(form.get("name") ?? "").trim() };
    for (const k of ["code", "address", "city", "state", "phone", "email"] as const) {
      const v = String(form.get(k) ?? "").trim();
      if (v) payload[k] = v;
    }
    const editing = modal.open && modal.branch;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        editing ? `/api/pharmacy/admin/branches/${editing.id}` : "/api/pharmacy/admin/branches",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save branch");
      setModal({ open: false });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save branch");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(b: BranchRow) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/pharmacy/admin/branches/${b.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !b.isActive }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update branch");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to update branch");
    } finally {
      setBusy(false);
    }
  }

  async function remove(b: BranchRow) {
    if (
      !confirm(
        `Delete branch "${b.name}"?\n\nStaff assigned to it become branchless and its stock / price rows are removed. This cannot be undone.`
      )
    )
      return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/pharmacy/admin/branches/${b.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete branch");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to delete branch");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--color-muted-fg)]">
          Branch staff only see their branch&apos;s stock and prices. The main branch always stays.
        </p>
        {!viewOnly && (
        <button
          type="button"
          onClick={() => setModal({ open: true, branch: null })}
          disabled={busy}
          className={btnPrimary}
        >
          <Plus size={14} aria-hidden="true" /> Add branch
        </button>
        )}
      </div>

      {err && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
        >
          {err}
        </p>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-[var(--color-muted-fg)]">Loading branches…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-12 text-center shadow-[var(--shadow-sm)]">
          <Store size={36} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">
            No branches yet — add your first one.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((b) => (
            <div
              key={b.id}
              className={`rounded-2xl border bg-white p-4 shadow-[var(--shadow-sm)] transition-colors duration-200 ${
                b.isActive ? "border-[var(--color-border)]" : "border-dashed opacity-70"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[var(--color-primary-dark)]">
                    <Store size={16} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--color-foreground)]">{b.name}</p>
                    <p className="text-[11px] text-[var(--color-muted-fg)]">
                      {b.isMain ? (
                        <span className="font-semibold text-[var(--color-primary-dark)]">Main branch</span>
                      ) : b.code ? (
                        b.code
                      ) : (
                        "Branch"
                      )}
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    b.isActive
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-100 text-slate-500"
                  }`}
                >
                  {b.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              {(b.address || b.city || b.state) && (
                <div className="mt-3 flex items-start gap-1.5 text-xs text-[var(--color-muted-fg)]">
                  <MapPin size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    {[b.address, b.city, b.state].filter(Boolean).join(", ")}
                  </span>
                </div>
              )}
              {b.phone && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-muted-fg)]">
                  <PhoneIcon size={12} aria-hidden="true" className="shrink-0" />
                  <span>{b.phone}</span>
                </div>
              )}
              {b.email && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-muted-fg)]">
                  <Mail size={12} aria-hidden="true" className="shrink-0" />
                  <span className="truncate">{b.email}</span>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                {!viewOnly && (
                <>
                <button
                  type="button"
                  onClick={() => setModal({ open: true, branch: b })}
                  disabled={busy}
                  className={btnGhost}
                >
                  <Pencil size={12} aria-hidden="true" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => void toggle(b)}
                  disabled={busy}
                  className={btnGhost}
                >
                  {b.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(b)}
                  disabled={busy || b.isMain}
                  title={b.isMain ? "The main branch cannot be deleted" : "Delete branch"}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-red-600 transition-colors duration-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 size={12} aria-hidden="true" /> Delete
                </button>
                </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={modal.branch ? `Edit ${modal.branch.name}` : "Add branch"}
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">{modal.branch ? `Edit — ${modal.branch.name}` : "Add branch"}</h3>
              <button
                type="button"
                onClick={() => setModal({ open: false })}
                className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100"
                aria-label="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submit(new FormData(e.currentTarget));
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium" htmlFor="b-name">
                    Branch name
                  </label>
                  <input
                    id="b-name"
                    name="name"
                    required
                    maxLength={120}
                    className={inputCls}
                    defaultValue={modal.branch?.name ?? ""}
                    placeholder="e.g. Victoria Island Pharmacy"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="b-code">
                    Code
                  </label>
                  <input
                    id="b-code"
                    name="code"
                    className={inputCls}
                    defaultValue={modal.branch?.code ?? ""}
                    placeholder="e.g. VI"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="b-phone">
                    Phone
                  </label>
                  <input
                    id="b-phone"
                    name="phone"
                    className={inputCls}
                    defaultValue={modal.branch?.phone ?? ""}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium" htmlFor="b-address">
                    Address
                  </label>
                  <input
                    id="b-address"
                    name="address"
                    className={inputCls}
                    defaultValue={modal.branch?.address ?? ""}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="b-city">
                    City
                  </label>
                  <input
                    id="b-city"
                    name="city"
                    className={inputCls}
                    defaultValue={modal.branch?.city ?? ""}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="b-state">
                    State
                  </label>
                  <input
                    id="b-state"
                    name="state"
                    className={inputCls}
                    defaultValue={modal.branch?.state ?? ""}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium" htmlFor="b-email">
                    Email
                  </label>
                  <input
                    id="b-email"
                    name="email"
                    type="email"
                    className={inputCls}
                    defaultValue={modal.branch?.email ?? ""}
                  />
                </div>
              </div>
              {err && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                >
                  {err}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setModal({ open: false })}
                  className={btnGhost + " flex-1 justify-center"}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className={btnPrimary + " flex-1 justify-center"}
                >
                  {busy ? "Saving…" : modal.branch ? "Save changes" : "Create branch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}