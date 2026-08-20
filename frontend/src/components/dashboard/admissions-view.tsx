"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft, DoorOpen, Loader2, Plus, RefreshCw, Search, Stethoscope, UserPlus, X,
} from "lucide-react";
import ImportExportMenu from "@/components/ui/import-export-menu";
import DateRangeBar from "@/components/filters/date-range-bar";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";
import type { AccessLevel } from "@/lib/nav";
import { mutedXs, mutedFg, mutedXsMt, flexWrapGap2, fgSemibold, spinner, rowStart } from "@/lib/ui-constants";

const EXPORT_COLUMNS = [
  "patient",
  "patient_number",
  "ward",
  "bed_number",
  "diagnosis",
  "admitted_at",
  "expected_discharge",
  "status",
];

const IMPORT_COLUMNS = ["patient_id", "bed_id", "diagnosis", "expected_discharge", "notes"];
const IMPORT_SAMPLE = [
  ["<patient UUID>", "<bed UUID>", "Malaria", "2026-08-20", ""],
];

const btnPrimary =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60";
const btnGhost =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-foreground)] transition-colors duration-200 hover:bg-slate-50 disabled:opacity-60";
const inputCls =
  "h-10 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-foreground)] outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";

interface Patient {
  id: string; first_name: string; last_name: string; patient_number: string;
}

interface BedOpt { id: string; bed_number: string; status: string; ward_id: string; }

interface WardOpt { id: string; name: string; ward_type: string | null; beds: BedOpt[]; }

interface AdmissionRow {
  id: string; status: string; admitted_at: string; discharged_at: string | null;
  diagnosis_at_admission: string | null; expected_discharge: string | null; notes: string | null;
  patients?: Patient | Patient[] | null;
  beds?: { id: string; bed_number: string; ward_id: string; ward?: { id: string; name: string; ward_type: string | null } | null } | null;
}

export default function AdmissionsView({ accessLevel = "full", myRole }: { accessLevel?: AccessLevel; myRole?: string }) {
  const viewOnly = accessLevel === "view_only";
  const [rows, setRows] = useState<AdmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"active" | "discharged">("active");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [showAdmit, setShowAdmit] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [wards, setWards] = useState<WardOpt[]>([]);
  const [form, setForm] = useState({
    patientId: "", bedId: "", diagnosis: "", expected_discharge: "",
  });

  const [transferFor, setTransferFor] = useState<AdmissionRow | null>(null);
  const [toBedId, setToBedId] = useState("");
  const [reason, setReason] = useState("");

  const [dischargeFor, setDischargeFor] = useState<AdmissionRow | null>(null);
  const [summary, setSummary] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [medications, setMedications] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ status: tab });
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    const res = await fetch(`/api/admissions?${params.toString()}`, { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) { setToast({ kind: "err", msg: body.error ?? "Failed to load admissions" }); setLoading(false); return; }
    setRows(body.data ?? []);
    setLoading(false);
  }, [tab, fromDate, toDate]);

  useEffect(() => { void load(); }, [load]);

  const loadLookups = useCallback(async () => {
    const [ptRes, wdRes] = await Promise.all([
      fetch("/api/patients?limit=500", { cache: "no-store" }),
      fetch("/api/wards", { cache: "no-store" }),
    ]);
    const pt = await ptRes.json();
    const wd = await wdRes.json();
    if (ptRes.ok) setPatients(pt.data ?? []);
    if (wdRes.ok) setWards((wd.data ?? []).map((w: any) => ({ ...w, beds: w.beds ?? [] })));
  }, []);

  const patientName = (a: AdmissionRow) => {
    const p = Array.isArray(a.patients) ? a.patients[0] : a.patients;
    return p ? `${p.first_name} ${p.last_name}` : "Unknown";
  };
  const patientNo = (a: AdmissionRow) => {
    const p = Array.isArray(a.patients) ? a.patients[0] : a.patients;
    return p?.patient_number ?? "";
  };

  const availableBeds = useMemo(
    () => wards.flatMap((w) => w.beds.filter((b) => b.status === "available").map((b) => ({ ...b, wardName: w.name }))),
    [wards]
  );

  const currentBedId = (a: AdmissionRow | null) => {
    const b = a?.beds;
    return b ? (Array.isArray(b) ? (b[0]?.id ?? null) : b.id) : null;
  };

  const openAdmit = () => {
    setShowAdmit(true);
    setForm({ patientId: "", bedId: "", diagnosis: "", expected_discharge: "" });
    void loadLookups();
  };

  const submitAdmit = async () => {
    setBusy(true); setToast(null);
    const res = await fetch("/api/admissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: form.patientId, bed_id: form.bedId, diagnosis: form.diagnosis, expected_discharge: form.expected_discharge || null }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { setToast({ kind: "err", msg: body.error ?? "Admission failed" }); return; }
    setShowAdmit(false);
    setToast(null);
    await load();
  };

  const submitTransfer = async () => {
    if (!transferFor) return;
    setBusy(true); setToast(null);
    const res = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admission_id: transferFor.id, to_bed_id: toBedId, reason: reason || null }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { setToast({ kind: "err", msg: body.error ?? "Transfer failed" }); return; }
    setTransferFor(null); setToBedId(""); setReason("");
    await load();
  };

  const submitDischarge = async () => {
    if (!dischargeFor) return;
    setBusy(true); setToast(null);
    const meds = medications
      .split("\n")
      .map((m) => m.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
    const res = await fetch("/api/discharges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admission_id: dischargeFor.id, summary, follow_up: followUp || null, medications: meds }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { setToast({ kind: "err", msg: body.error ?? "Discharge failed" }); return; }
    const ch = body?.data?.charge;
    if (ch?.invoiceNumber) {
      setToast({ kind: "ok", msg: `${patientName(dischargeFor)} discharged — ${ch.invoiceNumber} (₦${Number(ch.charge ?? 0).toLocaleString()}) posted` });
    } else {
      setToast(null);
    }
    setDischargeFor(null); setSummary(""); setFollowUp(""); setMedications("");
    await load();
  };

  const filtered = rows.filter((a) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || patientName(a).toLowerCase().includes(q) || patientNo(a).toLowerCase().includes(q);
    return matchesSearch && inDateRange(a.admitted_at, fromDate, toDate);
  });

  const rowsFor = (rs: AdmissionRow[]) =>
    rs.map((a) => {
      const p = Array.isArray(a.patients) ? a.patients[0] : a.patients;
      return [
        p ? `${p.first_name} ${p.last_name}` : "Unknown",
        p?.patient_number ?? "",
        a.beds?.ward?.name ?? "",
        a.beds?.bed_number ?? "",
        a.diagnosis_at_admission ?? "",
        a.admitted_at ?? "",
        a.expected_discharge ?? "",
        a.status,
      ];
    });

  function exportCsv() {
    if (rows.length === 0) {
      alert("Nothing to export — there are no admissions yet.");
      return;
    }
    downloadCsv(`admissions-${dateStamp()}.csv`, EXPORT_COLUMNS, rowsFor(rows));
  }

  function exportPdf() {
    if (rows.length === 0) {
      alert("Nothing to export — there are no admissions yet.");
      return;
    }
    printTable("Ward Admissions", EXPORT_COLUMNS, rowsFor(rows));
  }

  async function importAdmissions(rws: string[][]): Promise<ImportResult> {
    const errors: string[] = [];
    let created = 0;
    for (let i = 0; i < rws.length; i++) {
      const r = rws[i];
      try {
        const res = await fetch("/api/admissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId: r[0]?.trim(),
            bed_id: r[1]?.trim(),
            diagnosis: r[2]?.trim() || undefined,
            expected_discharge: r[3]?.trim() || null,
            notes: r[4]?.trim() || undefined,
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          errors.push(`Row ${i + 1}: ${body.error ?? "Admission failed"}`);
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
              <Stethoscope className="h-5 w-5 text-[var(--color-primary)]" /> Ward Admissions
            </h2>
            <p className={mutedXsMt}>
              Admit, transfer and discharge patients across wards.
            </p>
          </div>
          <div className={flexWrapGap2}>
            <button onClick={() => void load()} className={btnGhost} disabled={loading}>
              {loading ? <Loader2 className={spinner} /> : <RefreshCw size={14} />}
              Refresh
            </button>
            {!viewOnly && (
              <button onClick={openAdmit} className={btnPrimary}>
                <UserPlus size={14} /> Admit patient
              </button>
            )}
            <ImportExportMenu
              entityLabel="Admissions"
              exportCsv={exportCsv}
              exportPdf={exportPdf}
              importColumns={IMPORT_COLUMNS}
              importSample={IMPORT_SAMPLE}
              templateFilename="admissions-import-template.csv"
              onImport={importAdmissions}
              onImported={() => void load()}
              allowImport={!viewOnly}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-fg)]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search patient…" className={`${inputCls} pl-9`} style={{ width: 260 }} />
          </div>
          <DateRangeBar
            from={fromDate}
            to={toDate}
            onFromChange={setFromDate}
            onToChange={setToDate}
            onClear={() => { setFromDate(""); setToDate(""); }}
          />
          <div className="flex rounded-lg border border-[var(--color-border)] p-0.5">
            {(["active", "discharged"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${tab === t ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-muted-fg)] hover:bg-slate-50"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        {toast && (
          <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${toast.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
            {toast.msg}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16 text-[var(--color-muted-fg)]">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-[var(--color-muted-fg)]">
            {tab === "active" ? "No active admissions." : "No discharges yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className={rowStart}>
              <thead>
                <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                  <th className="px-4 py-3 font-semibold">Patient</th>
                  <th className="px-4 py-3 font-semibold">Ward / Bed</th>
                  <th className="px-4 py-3 font-semibold">Diagnosis</th>
                  <th className="px-4 py-3 font-semibold">Admitted</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  {!viewOnly && <th className="px-4 py-3 font-semibold text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className={fgSemibold}>{patientName(a)}</p>
                      <p className={mutedXs}>{patientNo(a)}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {a.beds?.ward?.name ?? "—"}
                      <span className={mutedFg}> · Bed {a.beds?.bed_number ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-xs">{a.diagnosis_at_admission ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      {new Date(a.admitted_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${a.status === "admitted" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {a.status}
                      </span>
                    </td>
                    {!viewOnly && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {a.status === "admitted" && (
                            <>
                              <button onClick={() => { setTransferFor(a); setToBedId(""); setReason(""); void loadLookups(); }} className={btnGhost} title="Transfer bed">
                                <ArrowRightLeft size={14} />
                              </button>
                              <button onClick={() => { setDischargeFor(a); setSummary(""); setFollowUp(""); setMedications(""); }} className={btnGhost} title="Discharge">
                                <DoorOpen size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- Admit modal ---- */}
      {showAdmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setShowAdmit(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-foreground)]">
                <UserPlus size={16} className="text-[var(--color-primary)]" /> Admit patient
              </h3>
              <button onClick={() => setShowAdmit(false)} className="text-[var(--color-muted-fg)] hover:text-foreground"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-[var(--color-muted-fg)]">
                Patient
                <select className={`${inputCls} mt-1`} value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
                  <option value="">Select patient…</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.patient_number})</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-[var(--color-muted-fg)]">
                Bed (available only)
                <select className={`${inputCls} mt-1`} value={form.bedId} onChange={(e) => setForm({ ...form, bedId: e.target.value })}>
                  <option value="">Select bed…</option>
                  {availableBeds.map((b) => (
                    <option key={b.id} value={b.id}>Bed {b.bed_number} — {b.wardName}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-[var(--color-muted-fg)]">
                Diagnosis on admission
                <input className={`${inputCls} mt-1`} value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} placeholder="e.g. Malaria" />
              </label>
              <label className="block text-xs font-semibold text-[var(--color-muted-fg)]">
                Expected discharge (optional)
                <input type="date" className={`${inputCls} mt-1`} value={form.expected_discharge} onChange={(e) => setForm({ ...form, expected_discharge: e.target.value })} />
              </label>
              {availableBeds.length === 0 && (
                <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700">No beds are currently available.</p>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowAdmit(false)} className={btnGhost} disabled={busy}>Cancel</button>
              <button onClick={() => void submitAdmit()} className={btnPrimary} disabled={busy || !form.patientId || !form.bedId}>
                {busy ? <Loader2 className={spinner} /> : <Plus size={14} />} Admit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Transfer modal ---- */}
      {transferFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setTransferFor(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-foreground)]">
                <ArrowRightLeft size={16} className="text-[var(--color-primary)]" /> Transfer {patientName(transferFor)}
              </h3>
              <button onClick={() => setTransferFor(null)} className="text-[var(--color-muted-fg)] hover:text-foreground"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-[var(--color-muted-fg)]">
                Destination bed
                <select className={`${inputCls} mt-1`} value={toBedId} onChange={(e) => setToBedId(e.target.value)}>
                  <option value="">Select bed…</option>
                  {availableBeds.filter((b) => b.id !== currentBedId(transferFor)).map((b) => (
                    <option key={b.id} value={b.id}>Bed {b.bed_number} — {b.wardName}</option>
                  ))}
                </select>
              </label>
              {availableBeds.filter((b) => b.id !== currentBedId(transferFor)).length === 0 && (
                <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700">No other beds are currently available to transfer into.</p>
              )}
              <label className="block text-xs font-semibold text-[var(--color-muted-fg)]">
                Reason (optional)
                <input className={`${inputCls} mt-1`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Closer to nurses station" />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setTransferFor(null)} className={btnGhost} disabled={busy}>Cancel</button>
              <button onClick={() => void submitTransfer()} className={btnPrimary} disabled={busy || !toBedId}>
                {busy ? <Loader2 className={spinner} /> : <ArrowRightLeft size={14} />} Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Discharge modal ---- */}
      {dischargeFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setDischargeFor(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-foreground)]">
                <DoorOpen size={16} className="text-[var(--color-primary)]" /> Discharge {patientName(dischargeFor)}
              </h3>
              <button onClick={() => setDischargeFor(null)} className="text-[var(--color-muted-fg)] hover:text-foreground"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-[var(--color-muted-fg)]">
                Discharge summary (required)
                <textarea className={`${inputCls} mt-1 min-h-24 resize-y`} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Condition at discharge, treatment given…" />
              </label>
              <label className="block text-xs font-semibold text-[var(--color-muted-fg)]">
                Medications on discharge (one per line)
                <textarea className={`${inputCls} mt-1 min-h-16 resize-y`} value={medications} onChange={(e) => setMedications(e.target.value)} placeholder={"Artemether 80mg\nParacetamol 1g"} />
              </label>
              <label className="block text-xs font-semibold text-[var(--color-muted-fg)]">
                Follow-up instructions
                <input className={`${inputCls} mt-1`} value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder="e.g. Review in 1 week" />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDischargeFor(null)} className={btnGhost} disabled={busy}>Cancel</button>
              <button onClick={() => void submitDischarge()} className={btnPrimary} disabled={busy || !summary.trim()}>
                {busy ? <Loader2 className={spinner} /> : <DoorOpen size={14} />} Discharge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}