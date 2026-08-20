"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, ShieldCheck, X } from "lucide-react";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { cardShell, mutedXs, mutedXsMt } from "@/lib/ui-constants";
import { btnPrimary, fetchAll, inputCls, ngn, type DrugOption } from "./pharmacy-shared";

// ---------------------------------------------------------------------------
// FORMULARY (COVERAGE) TAB - provider/drug coverage rules + co-pays
// ---------------------------------------------------------------------------
interface CoverageRow {
  id: string;
  provider_name: string;
  is_covered: boolean;
  co_pay_type: string;
  co_pay_value: number;
  max_qty_per_claim: number | null;
  pharmacy_drugs: { name: string } | null;
}

export function CoverageTab({ viewOnly = false }: { viewOnly?: boolean }) {
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState("");
  const [drugId, setDrugId] = useState("");
  const [drugName, setDrugName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DrugOption[]>([]);
  const [isCovered, setIsCovered] = useState(true);
  const [coPayType, setCoPayType] = useState<"percent" | "fixed" | "none">("percent");
  const [coPayValue, setCoPayValue] = useState("25");
  const [maxQty, setMaxQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pharmacy/insurance/coverage", { cache: "no-store" });
      if (res.ok) setRows((await res.json()).data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/pharmacy/drugs?query=${encodeURIComponent(query)}`, { cache: "no-store" });
      if (res.ok) setResults((await res.json()).data ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (!provider.trim() || !drugId) throw new Error("Provider and drug are required");
      const res = await fetch("/api/pharmacy/insurance/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerName: provider.trim(),
          drugId,
          isCovered,
          coPayType,
          coPayValue: ["percent", "fixed"].includes(coPayType) ? Number(coPayValue) || 0 : undefined,
          maxQtyPerClaim: maxQty ? Number(maxQty) : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      setDrugId("");
      setDrugName("");
      setQuery("");
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const lbl = "mb-1 block text-xs font-medium text-[var(--color-foreground)]";

  const COVERAGE_COLUMNS = ["provider_name", "drug_name", "is_covered", "co_pay_type", "co_pay_value", "max_qty_per_claim"];

  const coverageRows = () =>
    rows.map((r) => [
      r.provider_name,
      r.pharmacy_drugs?.name ?? "",
      r.is_covered ? "yes" : "no",
      r.co_pay_type,
      r.co_pay_value,
      r.max_qty_per_claim ?? "",
    ]);

  function exportCsv() {
    if (rows.length === 0) { alert("Nothing to export â€” there are no formulary rules yet."); return; }
    downloadCsv(`pharmacy-formulary-${dateStamp()}.csv`, COVERAGE_COLUMNS, coverageRows());
  }

  function exportPdf() {
    if (rows.length === 0) { alert("Nothing to export â€” there are no formulary rules yet."); return; }
    printTable("Pharmacy Formulary Coverage", COVERAGE_COLUMNS, coverageRows());
  }

  async function importCoverage(rowsIn: string[][]): Promise<ImportResult> {
    const drugs = await fetchAll<{ id: string; name: string }>("/api/pharmacy/drugs");
    const drugMap = new Map<string, string>(drugs.map((d) => [String(d.name).trim().toLowerCase(), d.id]));
    const errors: string[] = [];
    let created = 0;
    for (let i = 0; i < rowsIn.length; i++) {
      const r = rowsIn[i]!;
      const provider = String(r[0] ?? "").trim();
      const drugName = String(r[1] ?? "").trim();
      if (!provider) { errors.push(`Row ${i + 1}: provider is required`); continue; }
      const drugId = drugMap.get(drugName.toLowerCase());
      if (!drugId) { errors.push(`Row ${i + 1}: unknown drug "${drugName}"`); continue; }
      const coPayType = (["percent", "fixed", "none"].includes(String(r[3] ?? "").toLowerCase()) ? String(r[3]).toLowerCase() : "percent") as "percent" | "fixed" | "none";
      const res = await fetch("/api/pharmacy/insurance/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerName: provider,
          drugId,
          isCovered: !["no", "false", "0"].includes(String(r[2] ?? "").trim().toLowerCase()),
          coPayType,
          coPayValue: ["percent", "fixed"].includes(coPayType) ? Number(r[4]) || 0 : undefined,
          maxQtyPerClaim: String(r[5] ?? "").trim() ? Number(r[5]) : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) errors.push(`Row ${i + 1}: ${body.error ?? "save failed"}`);
      else created++;
    }
    return { created, failed: errors.length, errors };
  }

  return (
    <div className={`grid gap-5 ${viewOnly ? "lg:grid-cols-1" : "lg:grid-cols-2"}`}>
      {!viewOnly && (
      <div className={cardShell}>
        <h3 className="text-sm font-bold text-[var(--color-foreground)]">Add formulary rule</h3>
        <p className={mutedXsMt}>
          Defines whether a drug is covered by a provider and the patient co-pay.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className={lbl} htmlFor="cv-prov">Provider</label>
            <input id="cv-prov" value={provider} onChange={(e) => setProvider(e.target.value)} className={inputCls} placeholder="NHIS / HMO name" list="cv-providers" />
            <datalist id="cv-providers">
              {Array.from(new Set(rows.map((r) => r.provider_name))).map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>
          <div>
            <label className={lbl} htmlFor="cv-drug">Drug</label>
            <div className="relative">
              <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-[var(--color-muted-fg)]" />
              <input
                id="cv-drug"
                value={drugName || query}
                onChange={(e) => { setQuery(e.target.value); setDrugId(""); setDrugName(""); }}
                placeholder="Search the catalogueâ€¦"
                className={`${inputCls} pl-9`}
              />
            </div>
            {results.length > 0 && (
              <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white shadow-lg">
                {results.map((d) => (
                  <li key={d.id}>
                    <button type="button" onClick={() => { setDrugId(d.id); setDrugName(d.name); setQuery(""); setResults([]); }} className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-primary-soft)]">
                      <span className="block font-medium">{d.name}</span>
                      <span className="block text-xs text-[var(--color-muted-fg)]">{ngn(d.unitPrice)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isCovered} onChange={(e) => setIsCovered(e.target.checked)} className="accent-[var(--color-primary)]" />
            Covered by this provider
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} htmlFor="cv-copay">Co-pay type</label>
              <select id="cv-copay" value={coPayType} onChange={(e) => setCoPayType(e.target.value as "percent" | "fixed" | "none")} className={inputCls}>
                <option value="percent">Percent %</option>
                <option value="fixed">Fixed â‚¦</option>
                <option value="none">None</option>
              </select>
            </div>
            <div>
              <label className={lbl} htmlFor="cv-copayv">{coPayType === "percent" ? "Percent %" : coPayType === "fixed" ? "Amount (â‚¦)" : "â€”"}</label>
              <input id="cv-copayv" type="number" min={0} disabled={coPayType === "none"} value={coPayValue} onChange={(e) => setCoPayValue(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={lbl} htmlFor="cv-max">Max qty per claim</label>
            <input id="cv-max" type="number" min={0} value={maxQty} onChange={(e) => setMaxQty(e.target.value)} className={inputCls} placeholder="Unlimited" />
          </div>
        </div>

        {error && <p role="alert" className="mt-3 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>}

        <button type="button" onClick={save} disabled={busy || !drugId} className={btnPrimary + " mt-4"}>
          {busy ? "Savingâ€¦" : "Save rule"}
        </button>
      </div>
      )}

      <div className={cardShell}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[var(--color-foreground)]">Rules</h3>
          <ImportExportMenu
            entityLabel="Formulary Rules"
            exportCsv={exportCsv}
            exportPdf={exportPdf}
            importColumns={COVERAGE_COLUMNS}
            importSample={[["NHIS", "Paracetamol 500mg", "yes", "percent", "25", "30"]]}
            templateFilename="pharmacy-formulary-import-template.csv"
            onImport={importCoverage}
            onImported={() => void load()}
            allowImport={!viewOnly}
          />
        </div>
        {loading ? (
          <p className="py-6 text-center text-xs text-[var(--color-muted-fg)]">Loadingâ€¦</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--color-muted-fg)]">No formulary rules yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.pharmacy_drugs?.name ?? "â€”"}</p>
                  <p className={mutedXs}>
                    {r.provider_name} Â· {r.is_covered ? (
                      <span className="text-emerald-600">
                        {r.co_pay_type === "percent" ? `${r.co_pay_value}% co-pay` : r.co_pay_type === "fixed" ? `${ngn(r.co_pay_value)} co-pay` : "no co-pay"}
                      </span>
                    ) : <span className="text-red-500">not covered</span>}
                    {r.max_qty_per_claim ? ` Â· max ${r.max_qty_per_claim}/claim` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ShieldCheck size={14} aria-hidden="true" className={r.is_covered ? "text-emerald-500" : "text-red-400"} />
                  {!viewOnly && (
                  <button
                    type="button"
                    className="focus-ring rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-red-50 hover:text-red-600"
                    aria-label="Delete rule"
                    onClick={async () => {
                      await fetch(`/api/pharmacy/insurance/coverage?id=${r.id}`, { method: "DELETE" });
                      void load();
                    }}
                  >
                    <X size={14} />
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
