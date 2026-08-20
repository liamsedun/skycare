"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Plus, X } from "lucide-react";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { btnBase, divideBorder, errorBanner, flexBetween, ghostIconBtn, modalBackdrop, mutedXs, rowStart, tableHeadCell } from "@/lib/ui-constants";
import { Badge, btnGhost, btnPrimary, fetchAll, inputCls, ngn } from "./pharmacy-shared";

// ---------------------------------------------------------------------------
// CLAIMS TAB - insurance claims with approve/reject + new claim modal
// ---------------------------------------------------------------------------
interface ClaimRow {
  id: string;
  claim_number: string;
  provider_name: string;
  policy_number: string | null;
  claim_amount: number;
  co_pay_amount: number;
  approved_amount: number | null;
  status: string;
  created_at: string;
  pharmacy_invoices: { invoice_number: string; patients: { first_name: string; last_name: string } | null } | null;
}

export function ClaimsTab({ viewOnly = false }: { viewOnly?: boolean }) {
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Array<{ id: string; invoice_number: string; total_amount: number }>>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pharmacy/insurance/claims?pageSize=50", { cache: "no-store" });
      if (res.ok) setRows((await res.json()).data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function process(id: string, status: string, amount?: number) {
    try {
      const res = await fetch(`/api/pharmacy/insurance/claims/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, amount, notes: status === "rejected" ? "Rejected by pharmacy" : undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Update failed");
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  const CLAIMS_COLUMNS = ["claim_number", "invoice_number", "provider", "policy_number", "claim_amount", "co_pay_amount", "approved_amount", "status", "created_at"];

  const claimsRows = () =>
    rows.map((r) => [
      r.claim_number,
      r.pharmacy_invoices?.invoice_number ?? "",
      r.provider_name,
      r.policy_number ?? "",
      r.claim_amount,
      r.co_pay_amount,
      r.approved_amount ?? "",
      r.status,
      r.created_at,
    ]);

  function exportCsv() {
    if (rows.length === 0) { alert("Nothing to export â€” there are no claims yet."); return; }
    downloadCsv(`pharmacy-claims-${dateStamp()}.csv`, CLAIMS_COLUMNS, claimsRows());
  }

  function exportPdf() {
    if (rows.length === 0) { alert("Nothing to export â€” there are no claims yet."); return; }
    printTable("Pharmacy Insurance Claims", CLAIMS_COLUMNS, claimsRows());
  }

  async function importClaims(rowsIn: string[][]): Promise<ImportResult> {
    const invoices = await fetchAll<{ id: string; invoice_number: string }>("/api/pharmacy/invoices");
    const invMap = new Map<string, string>(invoices.map((i) => [String(i.invoice_number), i.id]));
    const errors: string[] = [];
    let created = 0;
    for (let i = 0; i < rowsIn.length; i++) {
      const r = rowsIn[i]!;
      const invoiceId = invMap.get(String(r[1] ?? "").trim());
      if (!invoiceId) { errors.push(`Row ${i + 1}: unknown invoice number "${r[1] ?? ""}"`); continue; }
      if (!String(r[2] ?? "").trim()) { errors.push(`Row ${i + 1}: provider is required`); continue; }
      const res = await fetch("/api/pharmacy/insurance/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          providerName: String(r[2]).trim(),
          policyNumber: String(r[3] ?? "").trim() || undefined,
          mode: "manual",
        }),
      });
      const body = await res.json();
      if (!res.ok) errors.push(`Row ${i + 1}: ${body.error ?? "claim failed"}`);
      else created++;
    }
    return { created, failed: errors.length, errors };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex-1" />
        <ImportExportMenu
          entityLabel="Insurance Claims"
          exportCsv={exportCsv}
          exportPdf={exportPdf}
          importColumns={["invoice_number", "provider", "policy_number"]}
          importSample={[["PH-INV-0001", "NHIS", "NH-88231"]]}
          templateFilename="pharmacy-claims-import-template.csv"
          onImport={importClaims}
          onImported={() => void load()}
          allowImport={!viewOnly}
        />
        {!viewOnly && (
        <button type="button" onClick={async () => {
          const res = await fetch("/api/pharmacy/invoices?status=unpaid&pageSize=100", { cache: "no-store" });
          if (res.ok) { setInvoices((await res.json()).data ?? []); setOpen(true); }
        }} className={btnPrimary}>
          <Plus size={14} aria-hidden="true" /> New claim
        </button>
        )}
      </div>

      {error && <p role="alert" className={errorBanner}>{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className={rowStart}>
          <thead>
            <tr className={tableHeadCell}>
              <th scope="col" className={btnBase}>Claim</th>
              <th scope="col" className={btnBase}>Invoice</th>
              <th scope="col" className={btnBase}>Provider</th>
              <th scope="col" className={btnBase}>Claim amount</th>
              <th scope="col" className={btnBase}>Co-pay</th>
              <th scope="col" className={btnBase}>Status</th>
              <th scope="col" className="px-4 py-2.5 text-right"></th>
            </tr>
          </thead>
          <tbody className={divideBorder}>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">Loadingâ€¦</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">No claims yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-medium">{r.claim_number}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{r.pharmacy_invoices?.invoice_number ?? "â€”"}</td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{r.provider_name}</p>
                    {r.policy_number && <p className={mutedXs}>{r.policy_number}</p>}
                  </td>
                  <td className={btnBase}>{ngn(r.claim_amount)}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{ngn(r.co_pay_amount)}</td>
                  <td className="px-4 py-2.5"><Badge value={r.status} /></td>
                  <td className="px-4 py-2.5 text-right">
                    {!viewOnly && (r.status === "pending" || r.status === "draft") && (
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => void process(r.id, "approved", r.claim_amount)} className={btnGhost}>
                          <CheckCircle2 size={13} aria-hidden="true" /> Approve
                        </button>
                        <button type="button" onClick={() => void process(r.id, "rejected")} className={btnGhost + " text-red-600"}>
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <NewClaimModal
          invoices={invoices}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); void load(); }}
        />
      )}
    </div>
  );
}

function NewClaimModal({ invoices, onClose, onSaved }: { invoices: Array<{ id: string; invoice_number: string; total_amount: number }>; onClose: () => void; onSaved: () => void }) {
  const [invoiceId, setInvoiceId] = useState("");
  const [provider, setProvider] = useState("NHIS");
  const [policy, setPolicy] = useState("");
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (!invoiceId) throw new Error("Pick an invoice");
      const res = await fetch("/api/pharmacy/insurance/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, providerName: provider.trim(), policyNumber: policy.trim() || undefined, mode }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Claim failed");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setBusy(false);
    }
  }

  const lbl = "mb-1 block text-xs font-medium text-[var(--color-foreground)]";

  return (
    <div className={modalBackdrop} role="dialog" aria-modal="true">
      <div className="my-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className={flexBetween}>
          <h3 className="text-lg font-bold">New insurance claim</h3>
          <button type="button" onClick={onClose} className={ghostIconBtn} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className={lbl} htmlFor="cl-inv">Invoice</label>
            <select id="cl-inv" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} className={inputCls}>
              <option value="">Select an unpaid invoiceâ€¦</option>
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>{i.invoice_number} â€” {ngn(i.total_amount)}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} htmlFor="cl-prov">Provider</label>
              <input id="cl-prov" value={provider} onChange={(e) => setProvider(e.target.value)} className={inputCls} placeholder="NHIS / HMO name" />
            </div>
            <div>
              <label className={lbl} htmlFor="cl-pol">Policy no.</label>
              <input id="cl-pol" value={policy} onChange={(e) => setPolicy(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={lbl}>Mode</label>
            <div className="flex gap-2" role="group" aria-label="Claim mode">
              <button type="button" onClick={() => setMode("auto")} className={mode === "auto" ? btnPrimary : btnGhost}>
                Auto (compute from formulary)
              </button>
              <button type="button" onClick={() => setMode("manual")} className={mode === "manual" ? btnPrimary : btnGhost}>
                Manual (draft)
              </button>
            </div>
          </div>
        </div>

        {error && <p role="alert" className="mt-3 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onClose} className={btnGhost + " flex-1 justify-center py-2.5"}>Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className={btnPrimary + " flex-1 justify-center py-2.5"}>
            {busy ? "Submittingâ€¦" : "Create claim"}
          </button>
        </div>
      </div>
    </div>
  );
}
