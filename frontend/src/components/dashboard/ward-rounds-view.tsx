"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, ClipboardList, Loader2, Plus, RefreshCw, X } from "lucide-react";
import ImportExportMenu from "@/components/ui/import-export-menu";
import DateRangeBar from "@/components/filters/date-range-bar";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";

const btnPrimary =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60";
const btnGhost =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-foreground)] transition-colors duration-200 hover:bg-slate-50 disabled:opacity-60";
const inputCls =
  "h-10 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-foreground)] outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";

const EXPORT_COLUMNS = [
  "patient",
  "patient_number",
  "bed_number",
  "round_time",
  "vitals",
  "notes",
];

const IMPORT_COLUMNS = ["admission_id", "notes", "vitals"];
const IMPORT_SAMPLE = [
  ["<admission UUID>", "Clinical findings, patient response…", '{"temp":"36.8","hr":"72"}'],
];

interface ActiveAdmission {
  id: string; patient_id: string; admitted_at: string; diagnosis_at_admission: string | null;
  patients?: { first_name: string; last_name: string; patient_number: string } | { first_name: string; last_name: string; patient_number: string }[] | null;
  beds?: { bed_number: string; ward?: { name: string } | null } | null;
}

interface RoundRow {
  id: string; admission_id: string; notes: string | null;
  vitals: Record<string, unknown> | null; round_time: string;
}

const VITAL_FIELDS: Array<[string, string]> = [
  ["temp", "Temp (°C)"], ["bp", "BP"], ["hr", "HR (bpm)"], ["rr", "RR"], ["spo2", "SpO₂ (%)"], ["weight", "Weight (kg)"],
];

export default function WardRoundsView() {
  const [active, setActive] = useState<ActiveAdmission[]>([]);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [admissionId, setAdmissionId] = useState("");
  const [notes, setNotes] = useState("");
  const [vitals, setVitals] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [actRes, rndRes] = await Promise.all([
      fetch("/api/admissions?status=active", { cache: "no-store" }),
      fetch("/api/ward-rounds", { cache: "no-store" }),
    ]);
    const act = await actRes.json();
    const rnd = await rndRes.json();
    if (actRes.ok && rndRes.ok) {
      setActive(act.data ?? []);
      setRounds(rnd.data ?? []);
    } else {
      setToast(act.error ?? rnd.error ?? "Failed to load ward rounds");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = rounds.filter((r) => inDateRange(r.round_time, from, to));

  const nameOf = (a: ActiveAdmission) => {
    const p = Array.isArray(a.patients) ? a.patients[0] : a.patients;
    return p ? `${p.first_name} ${p.last_name}` : "Unknown";
  };
  const patientOf = (round: RoundRow) => {
    const a = active.find((x) => x.id === round.admission_id);
    return a ? nameOf(a) : "—";
  };
  const bedOf = (round: RoundRow) => {
    const a = active.find((x) => x.id === round.admission_id);
    return a?.beds?.bed_number ?? "—";
  };

  const openAdd = () => {
    setShowAdd(true); setAdmissionId(""); setNotes(""); setVitals({});
  };

  const submit = async () => {
    if (!admissionId || !notes.trim()) return;
    setBusy(true); setToast(null);
    const vitalsObj: Record<string, string> = {};
    for (const [k] of VITAL_FIELDS) {
      const v = vitals[k]?.trim();
      if (v) vitalsObj[k] = v;
    }
    const res = await fetch("/api/ward-rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admission_id: admissionId, notes, vitals: vitalsObj }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { setToast(body.error ?? "Failed to add round"); return; }
    setShowAdd(false);
    await load();
  };

  const rowsFor = (rs: RoundRow[]) =>
    rs.map((r) => {
      const a = active.find((x) => x.id === r.admission_id);
      const p = a ? (Array.isArray(a.patients) ? a.patients[0] : a.patients) : null;
      return [
        p ? `${p.first_name} ${p.last_name}` : "—",
        p?.patient_number ?? "",
        a?.beds?.bed_number ?? "",
        r.round_time ?? "",
        r.vitals ? JSON.stringify(r.vitals) : "",
        r.notes ?? "",
      ];
    });

  function exportCsv() {
    if (rounds.length === 0) {
      alert("Nothing to export — there are no ward round entries yet.");
      return;
    }
    downloadCsv(`ward-rounds-${dateStamp()}.csv`, EXPORT_COLUMNS, rowsFor(rounds));
  }

  function exportPdf() {
    if (rounds.length === 0) {
      alert("Nothing to export — there are no ward round entries yet.");
      return;
    }
    printTable("Ward Rounds", EXPORT_COLUMNS, rowsFor(rounds));
  }

  function parseVitals(raw: string | undefined): Record<string, unknown> {
    if (!raw?.trim()) return {};
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  async function importRounds(rws: string[][]): Promise<ImportResult> {
    const errors: string[] = [];
    let created = 0;
    for (let i = 0; i < rws.length; i++) {
      const r = rws[i];
      try {
        const res = await fetch("/api/ward-rounds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admission_id: r[0]?.trim(),
            notes: r[1]?.trim(),
            vitals: parseVitals(r[2]),
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          errors.push(`Row ${i + 1}: ${body.error ?? "Failed to add ward round"}`);
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
              <ClipboardList className="h-5 w-5 text-[var(--color-primary)]" /> Ward Rounds
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
              Clinical observations and notes recorded during ward rounds.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void load()} className={btnGhost} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw size={14} />} Refresh
            </button>
            <button onClick={openAdd} className={btnPrimary}><Plus size={14} /> New round entry</button>
            <ImportExportMenu
              entityLabel="Ward Rounds"
              exportCsv={exportCsv}
              exportPdf={exportPdf}
              importColumns={IMPORT_COLUMNS}
              importSample={IMPORT_SAMPLE}
              templateFilename="ward-rounds-import-template.csv"
              onImport={importRounds}
              onImported={() => void load()}
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

      {loading ? (
        <div className="flex justify-center py-16 text-[var(--color-muted-fg)]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center text-sm text-[var(--color-muted-fg)]">
          No ward round entries yet.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <div key={r.id} className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--color-foreground)]">
                  {patientOf(r)} <span className="font-normal text-[var(--color-muted-fg)]">· Bed {bedOf(r)}</span>
                </p>
                <p className="text-xs text-[var(--color-muted-fg)]">
                  {new Date(r.round_time).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {r.vitals && Object.keys(r.vitals).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(r.vitals).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                      {VITAL_FIELDS.find(([key]) => key === k)?.[1] ?? k}: {String(v)}
                    </span>
                  ))}
                </div>
              )}
              {r.notes && <p className="mt-2 text-sm text-[var(--color-foreground)]/80">{r.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setShowAdd(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-foreground)]">
                <Activity size={16} className="text-[var(--color-primary)]" /> New ward round entry
              </h3>
              <button onClick={() => setShowAdd(false)} className="text-[var(--color-muted-fg)] hover:text-foreground"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-[var(--color-muted-fg)]">
                Patient (active admissions)
                <select className={`${inputCls} mt-1`} value={admissionId} onChange={(e) => setAdmissionId(e.target.value)}>
                  <option value="">Select patient…</option>
                  {active.map((a) => (
                    <option key={a.id} value={a.id}>{nameOf(a)} — {a.beds?.bed_number ?? "no bed"}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {VITAL_FIELDS.map(([k, label]) => (
                  <label key={k} className="block text-xs font-semibold text-[var(--color-muted-fg)]">
                    {label}
                    <input className={`${inputCls} mt-1`} value={vitals[k] ?? ""} onChange={(e) => setVitals({ ...vitals, [k]: e.target.value })} />
                  </label>
                ))}
              </div>
              <label className="block text-xs font-semibold text-[var(--color-muted-fg)]">
                Notes (required)
                <textarea className={`${inputCls} mt-1 min-h-24 resize-y`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Clinical findings, patient response…" />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className={btnGhost} disabled={busy}>Cancel</button>
              <button onClick={() => void submit()} className={btnPrimary} disabled={busy || !admissionId || !notes.trim()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus size={14} />} Save entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}