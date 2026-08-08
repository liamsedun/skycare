"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { generateDischargePDF } from "@/components/pdf/generateDischargePDF";

const btnGhost =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-foreground)] transition-colors duration-200 hover:bg-slate-50 disabled:opacity-60";

interface DischargeRow {
  id: string; admission_id: string; summary: string; discharged_at: string;
  follow_up: string | null; medications?: unknown[] | null;
  admission?: {
    patients?: { first_name: string; last_name: string; patient_number: string } | { first_name: string; last_name: string; patient_number: string }[] | null;
    invoices?: { invoice_number: string; total_amount: number; status: string } | { invoice_number: string; total_amount: number; status: string }[] | null;
  } | null;
}

export default function DischargesView() {
  const [rows, setRows] = useState<DischargeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [pdfing, setPdfing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/discharges/history", { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) { setToast(body.error ?? "Failed to load discharges"); setLoading(false); return; }
    setRows(body.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

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

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-[var(--color-foreground)]">
              <FileText className="h-5 w-5 text-[var(--color-primary)]" /> Discharges
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
              Discharge summaries with one-click PDF printout.
            </p>
          </div>
          <button onClick={() => void load()} className={btnGhost} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw size={14} />} Refresh
          </button>
        </div>
        {toast && <p className="mt-3 text-xs text-rose-600">{toast}</p>}
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16 text-[var(--color-muted-fg)]">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-[var(--color-muted-fg)]">No discharges yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
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
                {rows.map((d) => {
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
                        ) : (
                          <span className="text-[var(--color-muted-fg)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => void openPdf(d.admission_id)} className={btnGhost} disabled={pdfing === d.admission_id} title="Print discharge summary">
                          {pdfing === d.admission_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download size={14} />}
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