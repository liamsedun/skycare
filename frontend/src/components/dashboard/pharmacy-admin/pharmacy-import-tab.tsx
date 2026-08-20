"use client";

import { useRef, useState } from "react";
import { Upload, AlertTriangle, Download } from "lucide-react";
import { mutedXs, flexBetween, mutedSm, mutedXsMt1, fgSemibold, cardShell } from "@/lib/ui-constants";
import { inputCls, btnPrimary, btnGhost } from "./pharmacy-admin-shared";

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

  // 2) the user chose how to handle existing drugs â€” perform the real import
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
      <div className={cardShell}>
        <div className={flexBetween}>
          <h3 className="text-sm font-bold text-[var(--color-foreground)]">Upload catalogue</h3>
          <button type="button" onClick={downloadTemplate} className={btnGhost}>
            <Download size={13} aria-hidden="true" /> Template
          </button>
        </div>
        <p className={mutedXsMt1}>
          Columns: <code className="rounded bg-slate-100 px-1">name*, category*, form*</code>, generic_name, brand, dosage, sku, wholesale_price, unit_price, reorder_level, reorder_qty, requires_rx, nafdac_number, <code className="rounded bg-slate-100 px-1">supplier</code> (optional â€” the supplier&apos;s exact name; it must already exist on the Suppliers tab). Max 1000 rows.
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
            <span className={mutedXs}>
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
          <Upload size={14} aria-hidden="true" /> {busy ? "Uploadingâ€¦" : "Import"}
        </button>
      </div>

      <div className={cardShell}>
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
                      Row {e.row || "â€”"}: {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[11px] text-[var(--color-muted-fg)]">{report.total} row(s) processed Â· {report.skipped} skipped.</p>
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
                <p className={mutedSm}>
                  <span className={fgSemibold}>{pendingConfirm}</span> of the drug(s) in
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
                {confirming === "keep" ? "Importingâ€¦" : "Keep existing (add new only)"}
              </button>
              <button type="button" onClick={() => void doImport("replace")} disabled={confirming !== null} className={btnPrimary}>
                {confirming === "replace" ? "Replacingâ€¦" : "Replace them"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}