"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileText, Loader2, ReceiptText, RefreshCw } from "lucide-react";
import { generateDischargePDF } from "@/components/pdf/generateDischargePDF";
import ImportExportMenu from "@/components/ui/import-export-menu";
import DateRangeBar from "@/components/filters/date-range-bar";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";
import type { AccessLevel } from "@/lib/nav";
import { mutedFg, mutedXsMt, flexWrapGap2, spinner, rowStart } from "@/lib/ui-constants";

const btnGhost =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-foreground)] transition-colors duration-200 hover:bg-slate-50 disabled:opacity-60";

const EXPORT_COLUMNS = [
  "patient",
  "patient_number",
  "discharged_at",
  "summary",
  "follow_up",
  "medications",
  "invoice_number",
  "invoice_amount",
  "invoice_status",
];

const IMPORT_COLUMNS = ["admission_id", "summary", "follow_up", "medications"];
const IMPORT_SAMPLE = [
  ["<admission UUID>", "Condition at discharge, treatment given…", "Review in 1 week", "Artemether 80mg\nParacetamol 1g"],
];

interface DischargeRow {
  id: string; admission_id: string; summary: string; discharged_at: string;
  follow_up: string | null; medications?: unknown[] | null;
  admission?: {
    patients?: { first_name: string; last_name: string; patient_number: string } | { first_name: string; last_name: string; patient_number: string }[] | null;
    invoices?: { invoice_number: string; total_amount: number; status: string } | { invoice_number: string; total_amount: number; status: string }[] | null;
  } | null;
}

export default function DischargesView({ canBill, accessLevel = "full" }: { canBill: boolean; accessLevel?: AccessLevel }) {
  const viewOnly = accessLevel === "view_only";
  const [rows, setRows] = useState<DischargeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [pdfing, setPdfing] = useState<string | null>(null);
  const [billing, setBilling] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/discharges/history", { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) { setToast(body.error ?? "Failed to load discharges"); setLoading(false); return; }
    setRows(body.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = rows.filter((d) => inDateRange(d.discharged_at, from, to));

  const nameOf = (d: DischargeRow) => {
    const a = d.admission as any;
    const p = Array.isArray(a?.patients) ? a.patients[0] : a?.patients;
    return p ? `${p.first_name} ${p.last_name}` : "Unknown";
  };

  const invoiceOf = (d: DischargeRow) => {
    const a = d.admission as any;
    return Array.isArray(a?.invoices) ? a.invoices[0] : a?.invoices;
  };

  const openPdf = async (admissionId: string) => {
    setPdfing(admissionId); setToast(null);
    try {
      const res = await fetch(`/api/discharges/${admissionId}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load summary");
      const data = (await res.json()).data;
      const url = await generateDischargePDF(data);
      window.open(url, "_blank");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to generate PDF");
    } finally {
      setPdfing(null);
    }
  };

  const postBill = async (admissionId: string) => {
    if (!confirm("Post the ward room charge (daily rate × nights) as an invoice for this admission?")) return;
    setBilling(admissionId); setToast(null);
    try {
      const res = await fetch(`/api/admissions/${admissionId}/bill`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to post bill");
      setToast(
        body.data?.charge
          ? `Posted ${body.data.charge.invoiceNumber} — ₦${Number(body.data.charge.charge ?? 0).toLocaleString()}`
          : (body.data?.message ?? "No charge posted")
      );
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to post bill");
    } finally {
      setBilling(null);
    }
  };

  const rowsFor = (ds: DischargeRow[]) =>
    ds.map((d) => {
      const a = d.admission as any;
      const p = Array.isArray(a?.patients) ? a.patients[0] : a?.patients;
      const inv = Array.isArray(a?.invoices) ? a.invoices[0] : a?.invoices;
      const meds = Array.isArray(d.medications)
        ? d.medications.map((m: any) => (m && typeof m === "object" ? m.name : String(m))).filter(Boolean).join("; ")
        : "";
      return [
        p ? `${p.first_name} ${p.last_name}` : "Unknown",
        p?.patient_number ?? "",
        d.discharged_at ?? "",
        d.summary ?? "",
        d.follow_up ?? "",
        meds,
        inv?.invoice_number ?? "",
        inv ? Number(inv.total_amount ?? 0) : "",
        inv?.status ?? "",
      ];
    });

  function exportCsv() {
    if (rows.length === 0) {
      alert("Nothing to export — there are no discharges yet.");
      return;
    }
    downloadCsv(`discharges-${dateStamp()}.csv`, EXPORT_COLUMNS, rowsFor(rows));
  }

  function exportPdf() {
    if (rows.length === 0) {
      alert("Nothing to export — there are no discharges yet.");
      return;
    }
    printTable("Discharges", EXPORT_COLUMNS, rowsFor(rows));
  }

  async function importDischarges(rws: string[][]): Promise<ImportResult> {
    const errors: string[] = [];
    let created = 0;
    for (let i = 0; i < rws.length; i++) {
      const r = rws[i];
      try {
        const medications = (r[3] ?? "")
          .split("\n")
          .map((m) => m.trim())
          .filter(Boolean)
          .map((name) => ({ name }));
        const res = await fetch("/api/discharges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admission_id: r[0]?.trim(),
            summary: r[1]?.trim(),
            follow_up: r[2]?.trim() || null,
            medications,
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          errors.push(`Row ${i + 1}: ${body.error ?? "Discharge failed"}`);
          continue;
        }
        created++;
      } catch (e) {
        errors.push(`Row ${i + 1}: ${e instanceof Error ? e.message : "Network error"}`);
      }
    }
    return { created, failed: errors.length, errors };
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-[var(--color-foreground)]">
              <FileText className="h-5 w-5 text-[var(--color-primary)]" /> Discharges
            </h2>
            <p className={mutedXsMt}>
              Discharge summaries with one-click PDF printout.
            </p>
          </div>
          <div className={flexWrapGap2}>
            <button onClick={() => void load()} className={btnGhost} disabled={loading}>
              {loading ? <Loader2 className={spinner} /> : <RefreshCw size={14} />} Refresh
            </button>
            <ImportExportMenu
              entityLabel="Discharges"
              exportCsv={exportCsv}
              exportPdf={exportPdf}
              importColumns={IMPORT_COLUMNS}
              importSample={IMPORT_SAMPLE}
              templateFilename="discharges-import-template.csv"
              onImport={importDischarges}
              onImported={() => void load()}
              allowImport={!viewOnly}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <DateRangeBar
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
            onClear={() => { setFrom(""); setTo(""); }}
          />
        </div>
        {toast && <p className="mt-3 text-xs text-rose-600">{toast}</p>}
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16 text-[var(--color-muted-fg)]">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <p className="py-12 text-center text-sm text-[var(--color-muted-fg)]">No discharges yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={rowStart}>
              <thead>
                <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                  <th className="px-4 py-3 font-semibold">Patient</th>
                  <th className="px-4 py-3 font-semibold">Discharged</th>
                  <th className="px-4 py-3 font-semibold">Summary</th>
                  <th className="px-4 py-3 font-semibold">Follow-up</th>
                  <th className="px-4 py-3 font-semibold">Ward charges</th>
                  <th className="px-4 py-3 font-semibold text-right">PDF</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => {
                  const inv = invoiceOf(d);
                  return (
                    <tr key={d.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-semibold text-[var(--color-foreground)]">{nameOf(d)}</td>
                      <td className="px-4 py-3 text-xs">
                        {new Date(d.discharged_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="max-w-md px-4 py-3 text-xs line-clamp-2">{d.summary}</td>
                      <td className="px-4 py-3 text-xs">{d.follow_up ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">
                        {inv ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
                            {inv.invoice_number} · ₦{Number(inv.total_amount ?? 0).toLocaleString()}
                          </span>
                        ) : canBill && !viewOnly ? (
                          <button
                            type="button"
                            onClick={() => void postBill(d.admission_id)}
                            disabled={billing === d.admission_id}
                            className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
                            title="Post the ward room charge as an invoice"
                          >
                            {billing === d.admission_id ? (
                              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                            ) : (
                              <ReceiptText size={13} aria-hidden="true" />
                            )}
                            {billing === d.admission_id ? "Posting…" : "Post bill"}
                          </button>
                        ) : (
                          <span className={mutedFg}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => void openPdf(d.admission_id)} className={btnGhost} disabled={pdfing === d.admission_id} title="Print discharge summary">
                          {pdfing === d.admission_id ? <Loader2 className={spinner} /> : <Download size={14} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}