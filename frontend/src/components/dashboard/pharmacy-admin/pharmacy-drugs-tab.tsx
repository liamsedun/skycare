"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Plus, X, Pencil, Archive } from "lucide-react";
import { FORM_OPTIONS } from "@/lib/pharmacy-admin";
import { mutedXs, mutedFg, btnBase, flexBetween, divideBorder, flexWrapGap2, fgMedium, ghostIconBtn, rowStart, modalBackdrop, tableHeadCell } from "@/lib/ui-constants";
import { inputCls, btnPrimary, btnGhost, ngn, SupplierRow } from "./pharmacy-admin-shared";

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
        <Stat label="Catalogue entries" value={summary?.drugs ?? "â€”"} />
        <Stat label="Active" value={summary?.activeDrugs ?? "â€”"} />
        <Stat label="Low stock" value={summary?.lowStock ?? "â€”"} tone={(summary?.lowStock ?? 0) > 0 ? "warn" : "ok"} />
        <Stat label="Categories" value={summary?.categories ?? "â€”"} />
      </div>

      <div className={flexWrapGap2}>
        <div className="relative min-w-52 flex-1">
          <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name, generic, brand or SKUâ€¦"
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

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className={rowStart}>
          <thead>
            <tr className={tableHeadCell}>
              <th scope="col" className={btnBase}>Drug</th>
              <th scope="col" className={btnBase}>Category</th>
              <th scope="col" className={btnBase}>Stock</th>
              <th scope="col" className={btnBase}>Retail</th>
              <th scope="col" className={btnBase}>Effective</th>
              <th scope="col" className="px-4 py-2.5 text-right"></th>
            </tr>
          </thead>
          <tbody className={divideBorder}>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">Loadingâ€¦</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">No drugs found.</td></tr>
            ) : (
              rows.map((d) => (
                <tr key={d.id} className={d.isActive ? "" : "opacity-50"}>
                  <td className="px-4 py-2.5">
                    <p className={fgMedium}>{d.name}</p>
                    <p className={mutedXs}>
                      {[d.form, d.dosage].filter(Boolean).join(" Â· ")}
                      {d.genericName ? ` Â· ${d.genericName}` : ""}
                      {d.isControlled && (
                        <span className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold uppercase text-red-700">controlled</span>
                      )}
                      {!d.isActive && <span className="ml-1 rounded bg-slate-200 px-1 py-0.5 text-[9px] font-bold uppercase text-slate-600">archived</span>}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{d.category}</td>
                  <td className="px-4 py-2.5">
                    <span className={`font-semibold ${d.stock <= d.reorderLevel ? "text-amber-600" : "text-emerald-600"}`}>{d.stock}</span>
                    <span className={mutedXs}> / min {d.reorderLevel}</span>
                  </td>
                  <td className="px-4 py-2.5">{ngn(d.unitPrice)}</td>
                  <td className="px-4 py-2.5">
                    {d.effectivePrice !== d.unitPrice ? (
                      <span className="font-semibold text-[var(--color-primary)]">{ngn(d.effectivePrice)}</span>
                    ) : (
                      <span className={mutedFg}>â€”</span>
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
    <div className={modalBackdrop} role="dialog" aria-modal="true">
      <div className="my-4 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className={flexBetween}>
          <h3 className="text-lg font-bold">{drug ? "Edit drug" : "Add drug"}</h3>
          <button type="button" onClick={onClose} className={ghostIconBtn} aria-label="Close">
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
              <option value="">â€” None â€”</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-[var(--color-muted-fg)]">
              Tags this drug to a supplier â€” it then pins to the top of the New purchase order list and appears in the import template.
            </p>
          </div>
          <div className={field}>
            <label className={lbl} htmlFor="ad-wholesale">Wholesale (â‚¦)</label>
            <input id="ad-wholesale" type="number" min={0} value={form.wholesalePrice} onChange={(e) => set("wholesalePrice", e.target.value)} className={inputCls} />
          </div>
          <div className={field}>
            <label className={lbl} htmlFor="ad-price">Retail price (â‚¦)</label>
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
            {busy ? "Savingâ€¦" : drug ? "Save changes" : "Add drug"}
          </button>
        </div>
      </div>
    </div>
  );
}