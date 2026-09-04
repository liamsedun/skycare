"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X, Pencil, Archive } from "lucide-react";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";
import FilterBar from "@/components/filters/filter-bar";
import { mutedXs, btnBase, flexBetween, divideBorder, flexWrapGap2, fgMedium, ghostIconBtn, rowStart, modalBackdrop, tableHeadCell } from "@/lib/ui-constants";
import { inputCls, btnPrimary, btnGhost, SupplierRow } from "./pharmacy-admin-shared";

// ---------------------------------------------------------------------------
// SUPPLIERS TAB
// ---------------------------------------------------------------------------

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
    if (visible.length === 0) { alert("Nothing to export â€” there are no suppliers yet."); return; }
    downloadCsv(`suppliers-${dateStamp()}.csv`, SUPPLIER_COLUMNS, supplierRows());
  }

  function exportPdf() {
    if (visible.length === 0) { alert("Nothing to export â€” there are no suppliers yet."); return; }
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
          searchPlaceholder="Search name, code, contactâ€¦"
          searchWidth={240}
        />
        <div className={flexWrapGap2}>
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

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className={rowStart}>
          <thead>
            <tr className={tableHeadCell}>
              <th scope="col" className={btnBase}>Supplier</th>
              <th scope="col" className={btnBase}>Contact</th>
              <th scope="col" className={btnBase}>Phone</th>
              <th scope="col" className={btnBase}>NAFDAC</th>
              <th scope="col" className={btnBase}>Terms</th>
              <th scope="col" className="px-4 py-2.5 text-right"></th>
            </tr>
          </thead>
          <tbody className={divideBorder}>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">Loadingâ€¦</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">No suppliers match these filters.</td></tr>
            ) : (
              visible.map((s) => (
                <tr key={s.id} className={s.isActive ? "" : "opacity-50"}>
                  <td className="px-4 py-2.5">
                    <p className={fgMedium}>{s.name}</p>
                    {s.code && <p className={mutedXs}>{s.code}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">
                    {(() => { const parts: React.ReactNode[] = []; if (s.contactPerson) parts.push(s.contactPerson); if (s.email) parts.push(<a key={s.id} href={`mailto:${s.email}`} className="hover:underline">{s.email}</a>); return parts.length ? <>{parts.reduce((a: React.ReactNode, b: React.ReactNode, i: number) => <>{a}{i > 0 ? " \u00b7 " : ""}{b}</>)}</> : "\u2014"; })()}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{s.phone ? <a href={`tel:${s.phone}`} className="hover:underline">{s.phone}</a> : "\u2014"}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{s.nafdacLicense ?? "â€”"}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{s.paymentTerms ?? "â€”"}</td>
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
    <div className={modalBackdrop} role="dialog" aria-modal="true">
      <div className="my-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className={flexBetween}>
          <h3 className="text-lg font-bold">{supplier ? "Edit supplier" : "Add supplier"}</h3>
          <button type="button" onClick={onClose} className={ghostIconBtn} aria-label="Close">
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
            {busy ? "Savingâ€¦" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}