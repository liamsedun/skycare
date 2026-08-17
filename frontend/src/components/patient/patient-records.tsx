"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ClipboardList, FileText, Loader2, PenLine, Stethoscope } from "lucide-react";
import {
  AppHeader,
  AppSegmented,
  AppSkeletonList,
} from "@/components/patient/mobile/mobile-app-ui";

interface MedicalRecord {
  id: string;
  record_type: string;
  title: string | null;
  content: string | null;
  created_at: string;
  is_confidential: boolean;
  created_by: string | null;
  users: { full_name: string; role: string } | null;
  patients: { first_name: string; last_name: string } | null;
}

interface DoctorNote {
  id: string;
  patient_id: string;
  visit_date: string;
  clinical_findings: string | null;
  treatment_recommendations: string | null;
  diagnosis: Record<string, unknown>;
  medications: Array<Record<string, string | number>>;
  vitals: Record<string, string | number>;
  tests_procedures: Record<string, string | number>;
  next_visit_date: string | null;
  next_visit_reason: string | null;
  created_at: string;
  users: { full_name: string; role: string } | null;
  patients: { first_name: string; last_name: string } | null;
}

interface MedicalReport {
  id: string;
  reference_number: string;
  report_date: string;
  content: string;
  author_name: string | null;
  author_title: string | null;
  created_at: string;
}

const recordTypeLabels: Record<string, string> = {
  diagnosis: "Diagnosis",
  lab_result: "Lab result",
  prescription: "Prescription",
  surgery_report: "Surgery report",
  vaccination: "Vaccination",
  imaging: "Imaging",
  progress_note: "Progress note",
  admission_summary: "Admission summary",
  discharge_summary: "Discharge summary",
};

const VITAL_FIELDS: Array<{ key: string; label: string; placeholder?: string }> = [
  { key: "bp", label: "Blood pressure", placeholder: "e.g. 120/80" },
  { key: "weight", label: "Weight", placeholder: "e.g. 70 kg" },
  { key: "height", label: "Height", placeholder: "e.g. 172 cm" },
  { key: "temperature", label: "Temperature", placeholder: "e.g. 36.8°C" },
  { key: "heart_rate", label: "Heart rate", placeholder: "e.g. 78 bpm" },
  { key: "respiratory_rate", label: "Respiratory rate", placeholder: "e.g. 16/min" },
  { key: "allergies", label: "Allergies", placeholder: "e.g. Penicillin" },
];

const TEST_FIELDS: Array<{ key: string; label: string }> = [
  { key: "ecg", label: "ECG" },
  { key: "xray", label: "X-Ray" },
  { key: "blood_test", label: "Blood test" },
  { key: "urine_test", label: "Urine test" },
  { key: "saliva_test", label: "Saliva test" },
  { key: "other_tests", label: "Other tests" },
];

interface NoteForm {
  vitals: Record<string, string>;
  testsProcedures: Record<string, string>;
  clinicalFindings: string;
  diagnosis: { primary: string; secondary: string; suspected: string };
  medications: Array<{ drug_name: string; dosage: string; frequency: string; duration: string }>;
  treatmentRecommendations: string;
  nextVisitDate: string;
  nextVisitReason: string;
}

function formFromNote(n: DoctorNote): NoteForm {
  const v = (n.vitals ?? {}) as Record<string, unknown>;
  const t = (n.tests_procedures ?? {}) as Record<string, unknown>;
  const d = (n.diagnosis ?? {}) as Record<string, unknown>;
  return {
    vitals: Object.fromEntries(Object.entries(v).map(([k, val]) => [k, String(val ?? "")])),
    testsProcedures: Object.fromEntries(Object.entries(t).map(([k, val]) => [k, String(val ?? "")])),
    clinicalFindings: n.clinical_findings ?? "",
    diagnosis: {
      primary: String(d.primary ?? ""),
      secondary: Array.isArray(d.secondary) ? d.secondary.join(", ") : "",
      suspected: Array.isArray(d.suspected) ? d.suspected.join(", ") : "",
    },
    medications: (n.medications ?? []).map((m) => ({
      drug_name: String(m.drug_name ?? m.name ?? m.medication ?? ""),
      dosage: String(m.dosage ?? ""),
      frequency: String(m.frequency ?? ""),
      duration: String(m.duration ?? ""),
    })),
    treatmentRecommendations: n.treatment_recommendations ?? "",
    nextVisitDate: n.next_visit_date?.slice(0, 10) ?? "",
    nextVisitReason: n.next_visit_reason ?? "",
  };
}

function buildPayload(form: NoteForm): Record<string, unknown> {
  const meds = form.medications.filter((m) => m.drug_name.trim());
  return {
    vitals: Object.fromEntries(Object.entries(form.vitals).filter(([, val]) => val)),
    testsProcedures: Object.fromEntries(Object.entries(form.testsProcedures).filter(([, val]) => val)),
    clinicalFindings: form.clinicalFindings.trim() || undefined,
    diagnosis: {
      ...(form.diagnosis.primary.trim() ? { primary: form.diagnosis.primary.trim() } : {}),
      ...(form.diagnosis.secondary.trim() ? { secondary: form.diagnosis.secondary.split(",").map((s) => s.trim()).filter(Boolean) } : {}),
      ...(form.diagnosis.suspected.trim() ? { suspected: form.diagnosis.suspected.split(",").map((s) => s.trim()).filter(Boolean) } : {}),
    },
    medications: meds,
    treatmentRecommendations: form.treatmentRecommendations.trim() || undefined,
    nextVisitDate: form.nextVisitDate || undefined,
    nextVisitReason: form.nextVisitReason.trim() || undefined,
  };
}

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function NoteEditModal({
  note,
  onClose,
  onSaved,
}: {
  note: DoctorNote;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<NoteForm>(() => formFromNote(note));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateVital(key: string, value: string) {
    setForm((f) => ({ ...f, vitals: { ...f.vitals, [key]: value } }));
  }

  function updateTest(key: string, value: string) {
    setForm((f) => ({ ...f, testsProcedures: { ...f.testsProcedures, [key]: value } }));
  }

  function updateDiagnosis(key: "primary" | "secondary" | "suspected", value: string) {
    setForm((f) => ({ ...f, diagnosis: { ...f.diagnosis, [key]: value } }));
  }

  function updateMedication(i: number, patch: Partial<{ drug_name: string; dosage: string; frequency: string; duration: string }>) {
    setForm((f) => {
      const meds = [...f.medications];
      meds[i] = { ...meds[i], ...patch };
      return { ...f, medications: meds };
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor-notes/${note.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(form)),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save note");
      onSaved();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed to save note");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Edit Doctor Note"
    >
      <div className="my-4 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Edit Doctor Note</h2>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={save} className="mt-5 space-y-5">
          {error && (
            <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
              {error}
            </p>
          )}
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Edits are recorded with your patient account and visible to your hospital&apos;s staff.
          </p>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">1. Vital signs & measurements</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {VITAL_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className={labelCls} htmlFor={`pr-v-${f.key}`}>{f.label}</label>
                  <input id={`pr-v-${f.key}`} className={inputCls} placeholder={f.placeholder} value={form.vitals[f.key] ?? ""} onChange={(e) => updateVital(f.key, e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">2. Tests / procedures conducted</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {TEST_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className={labelCls} htmlFor={`pr-t-${f.key}`}>{f.label}</label>
                  <input id={`pr-t-${f.key}`} className={inputCls} placeholder="Result / notes" value={form.testsProcedures[f.key] ?? ""} onChange={(e) => updateTest(f.key, e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="pr-findings">3. Clinical findings / observations</label>
            <textarea id="pr-findings" rows={3} className={inputCls} placeholder="Patient complaints, examination findings, notable abnormalities…" value={form.clinicalFindings} onChange={(e) => setForm((f) => ({ ...f, clinicalFindings: e.target.value }))} />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">4. Diagnosis / assessment</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls} htmlFor="pr-d-primary">Primary</label>
                <input id="pr-d-primary" className={inputCls} placeholder="e.g. Type 2 diabetes" value={form.diagnosis.primary} onChange={(e) => updateDiagnosis("primary", e.target.value)} />
              </div>
              <div>
                <label className={labelCls} htmlFor="pr-d-secondary">Secondary (comma-separated)</label>
                <input id="pr-d-secondary" className={inputCls} placeholder="e.g. Hypertension" value={form.diagnosis.secondary} onChange={(e) => updateDiagnosis("secondary", e.target.value)} />
              </div>
              <div>
                <label className={labelCls} htmlFor="pr-d-suspected">Suspected (comma-separated)</label>
                <input id="pr-d-suspected" className={inputCls} placeholder="e.g. Sleep apnea" value={form.diagnosis.suspected} onChange={(e) => updateDiagnosis("suspected", e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">5. Medications prescribed</p>
            <div className="space-y-2">
              {form.medications.map((m, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--color-border)] bg-slate-50/60 p-3 sm:grid-cols-5">
                  <input className={inputCls} placeholder="Drug name" value={m.drug_name} onChange={(e) => updateMedication(i, { drug_name: e.target.value })} />
                  <input className={inputCls} placeholder="Dosage" value={m.dosage} onChange={(e) => updateMedication(i, { dosage: e.target.value })} />
                  <input className={inputCls} placeholder="Frequency" value={m.frequency} onChange={(e) => updateMedication(i, { frequency: e.target.value })} />
                  <input className={inputCls} placeholder="Duration" value={m.duration} onChange={(e) => updateMedication(i, { duration: e.target.value })} />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, medications: f.medications.filter((_, idx) => idx !== i) }))}
                    className="focus-ring rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, medications: [...f.medications, { drug_name: "", dosage: "", frequency: "", duration: "" }] }))}
                className="focus-ring rounded-lg border border-dashed border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)]"
              >
                + Add medication
              </button>
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="pr-treat">6. Treatment / recommendations</label>
            <textarea id="pr-treat" rows={3} className={inputCls} placeholder="Lifestyle advice, referrals, follow-up tests…" value={form.treatmentRecommendations} onChange={(e) => setForm((f) => ({ ...f, treatmentRecommendations: e.target.value }))} />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">7. Next visit</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="pr-next-date">Next appointment date</label>
                <input id="pr-next-date" type="date" className={inputCls} value={form.nextVisitDate} onChange={(e) => setForm((f) => ({ ...f, nextVisitDate: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls} htmlFor="pr-next-reason">Reason for follow-up</label>
                <input id="pr-next-reason" className={inputCls} placeholder="e.g. Review test results" value={form.nextVisitReason} onChange={(e) => setForm((f) => ({ ...f, nextVisitReason: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
            >
              {busy && <Loader2 size={15} aria-hidden="true" className="animate-spin" />}
              {busy ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PatientRecords() {
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [notes, setNotes] = useState<DoctorNote[]>([]);
  const [reports, setReports] = useState<MedicalReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingNote, setEditingNote] = useState<DoctorNote | null>(null);
  const [tab, setTab] = useState<"records" | "notes" | "reports">("records");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, noteRes, repRes] = await Promise.all([
        fetch("/api/medical-records?pageSize=100", { cache: "no-store" }),
        fetch("/api/doctor-notes?pageSize=100", { cache: "no-store" }),
        fetch("/api/medical-reports?pageSize=100", { cache: "no-store" }),
      ]);
      const [rec, note, rep] = await Promise.all([recRes.json(), noteRes.json(), repRes.json()]);
      if (!recRes.ok) throw new Error(rec.error ?? "Failed to load medical records");
      setRecords(rec.data ?? []);
      if (noteRes.ok) setNotes(note.data ?? []);
      if (repRes.ok) setReports(rep.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load your records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const hasAnything = records.length > 0 || notes.length > 0 || reports.length > 0;

  return (
    <>
      <div className="hidden md:block">
        <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Medical Records</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Your clinical records, doctor notes and reports.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading your records…</p>
      ) : !hasAnything ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <ClipboardList size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">No records yet.</p>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Your visits will appear here.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 border-b border-[var(--color-border)] pb-3">
            {(
              [
                ["records", "Medical Records", ClipboardList],
                ["notes", "Clinical Notes", Stethoscope],
                ["reports", "Medical Reports", FileText],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                  tab === key
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]/60 hover:text-[var(--color-foreground)]"
                }`}
              >
                <Icon size={13} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>

          {tab === "records" && (
          records.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Medical Records</h2>
              {records.map((rec) => {
                const open = expanded[`r-${rec.id}`];
                return (
                  <div key={rec.id} className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
                    <button
                      type="button"
                      onClick={() => toggle(`r-${rec.id}`)}
                      className="focus-ring flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <ChevronDown size={16} aria-hidden="true" className={`text-[var(--color-muted-fg)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                        <div>
                          <p className="text-sm font-semibold text-[var(--color-foreground)]">
                            {recordTypeLabels[rec.record_type] ?? rec.record_type.replace(/_/g, " ")}
                          </p>
                          <p className="text-xs text-[var(--color-muted-fg)]">
                            {fmtDate(rec.created_at)}
                            {rec.users ? ` · ${rec.users.full_name}` : ""}
                          </p>
                        </div>
                      </div>
                      {rec.title ? <span className="text-xs text-[var(--color-muted-fg)]">{rec.title}</span> : null}
                    </button>
                    {open && rec.content && (
                      <div className="border-t border-[var(--color-border)] bg-slate-50/60 px-4 py-4">
                        <p className="whitespace-pre-wrap text-sm text-[var(--color-foreground)]">{rec.content}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-white py-10 text-center text-sm text-[var(--color-muted-fg)]">
              No medical records yet.
            </p>
          )
          )}

          {tab === "notes" && (
          notes.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Clinical Notes</h2>
              {notes.map((note) => {
                const open = expanded[`n-${note.id}`];
                const diag = (note.diagnosis ?? {}) as Record<string, string>;
                const meds = note.medications ?? [];
                const vitals = note.vitals ?? {};
                return (
                  <div key={note.id} className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
                    <div className="flex items-center gap-2 px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => toggle(`n-${note.id}`)}
                        className="focus-ring flex w-full min-w-0 items-center justify-between gap-3 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <Stethoscope size={16} aria-hidden="true" className="shrink-0 text-[var(--color-muted-fg)]" />
                          <div>
                            <p className="text-sm font-semibold text-[var(--color-foreground)]">
                              Visit · {fmtDate(note.visit_date)}
                            </p>
                            <p className="text-xs text-[var(--color-muted-fg)]">
                              {note.users?.full_name ?? "Doctor"}
                              {note.next_visit_date ? ` · Next visit: ${fmtDate(note.next_visit_date)}` : ""}
                            </p>
                          </div>
                        </div>
                        <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-[var(--color-muted-fg)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingNote(note)}
                        className="focus-ring shrink-0 rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-slate-100 hover:text-[var(--color-primary)]"
                        aria-label="Edit note"
                        title="Edit note"
                      >
                        <PenLine size={15} />
                      </button>
                    </div>
                    {open && (
                      <div className="space-y-3 border-t border-[var(--color-border)] bg-slate-50/60 px-4 py-4 text-sm">
                        {Object.keys(vitals).length > 0 && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Vitals</p>
                            <p className="mt-1 text-[var(--color-foreground)]">
                              {Object.entries(vitals).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}
                            </p>
                          </div>
                        )}
                        {note.clinical_findings && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Findings</p>
                            <p className="mt-1 whitespace-pre-wrap text-[var(--color-foreground)]">{note.clinical_findings}</p>
                          </div>
                        )}
                        {Object.keys(diag).length > 0 && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Diagnosis</p>
                            <p className="mt-1 text-[var(--color-foreground)]">
                              {Object.entries(diag).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}
                            </p>
                          </div>
                        )}
                        {meds.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Medications</p>
                            <ul className="mt-1 space-y-1 text-[var(--color-foreground)]">
                              {meds.map((m, i) => (
                                <li key={i}>
                                  {String(m.name ?? m.medication ?? "Medication")}
                                  {m.dosage ? ` — ${m.dosage}` : ""}
                                  {m.frequency ? ` (${m.frequency})` : ""}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {note.treatment_recommendations && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Recommendations</p>
                            <p className="mt-1 whitespace-pre-wrap text-[var(--color-foreground)]">{note.treatment_recommendations}</p>
                          </div>
                        )}
                        {note.next_visit_reason && (
                          <p className="text-xs text-[var(--color-muted-fg)]">
                            Next visit reason: {note.next_visit_reason}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-white py-10 text-center text-sm text-[var(--color-muted-fg)]">
              No clinical notes yet.
            </p>
          )
          )}

          {tab === "reports" && (
          reports.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Medical Reports</h2>
              {reports.map((rep) => {
                const open = expanded[`p-${rep.id}`];
                return (
                  <div key={rep.id} className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
                    <button
                      type="button"
                      onClick={() => toggle(`p-${rep.id}`)}
                      className="focus-ring flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <FileText size={16} aria-hidden="true" className="text-[var(--color-muted-fg)]" />
                        <div>
                          <p className="font-mono text-sm font-semibold text-[var(--color-foreground)]">{rep.reference_number}</p>
                          <p className="text-xs text-[var(--color-muted-fg)]">
                            {fmtDate(rep.report_date)}
                            {rep.author_name ? ` · ${rep.author_name}` : ""}
                          </p>
                        </div>
                      </div>
                      <ChevronDown size={16} aria-hidden="true" className={`text-[var(--color-muted-fg)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                    </button>
                    {open && (
                      <div className="border-t border-[var(--color-border)] bg-slate-50/60 px-4 py-4">
                        <p className="whitespace-pre-wrap text-sm text-[var(--color-foreground)]">{rep.content}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-white py-10 text-center text-sm text-[var(--color-muted-fg)]">
              No medical reports yet.
            </p>
          )
          )}
        </>
      )}

      {editingNote && (
        <NoteEditModal
          note={editingNote}
          onClose={() => setEditingNote(null)}
          onSaved={() => {
            setEditingNote(null);
            load();
          }}
        />
      )}
    </div>
      </div>

      {/* ── Mobile app view (Life Blossom parity, <md) ─────────────────── */}
      <div className="md:hidden">
        <div className="space-y-4">
          <AppHeader title="Medical Records" meta={`${records.length + notes.length + reports.length} entries`} />

          <AppSegmented<"records" | "notes" | "reports">
            tabs={[
              { key: "records", label: "Records" },
              { key: "notes", label: "Notes" },
              { key: "reports", label: "Reports" },
            ]}
            active={tab}
            onChange={setTab}
          />

          {error && (
            <p role="alert" className="rounded-xl bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
              {error}
            </p>
          )}

          {loading ? (
            <AppSkeletonList rows={3} />
          ) : !hasAnything ? (
            <div className="app-glass rounded-2xl py-10 text-center">
              <ClipboardList size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
              <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">No records yet.</p>
              <p className="mt-1 text-xs text-[var(--color-muted-fg)]">Your visits will appear here.</p>
            </div>
          ) : (
            <div className="relative ml-1.5 space-y-4 border-l-2 border-[#e0a84a]/30 pl-4">
              {tab === "records" &&
                (records.length === 0 ? (
                  <p className="app-glass rounded-2xl py-8 text-center text-xs text-[var(--color-muted-fg)]">No medical records yet.</p>
                ) : (
                  records.map((rec) => {
                    const open = expanded[`r-${rec.id}`];
                    return (
                      <div key={rec.id} className="relative">
                        <span aria-hidden="true" className="absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full bg-[#e0a84a] shadow-[0_0_0_3px_rgba(224,168,74,0.25)]" />
                        <button
                          type="button"
                          onClick={() => toggle(`r-${rec.id}`)}
                          aria-expanded={open}
                          className="app-glass w-full rounded-2xl p-4 text-left"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[var(--color-foreground)]">
                                {recordTypeLabels[rec.record_type] ?? rec.record_type.replace(/_/g, " ")}
                              </p>
                              <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
                                {fmtDate(rec.created_at)}
                                {rec.users ? ` · ${rec.users.full_name}` : ""}
                              </p>
                            </div>
                            {rec.title ? (
                              <span className="shrink-0 rounded-full bg-[#e0a84a]/10 px-2 py-0.5 text-[10px] font-medium text-[#e0a84a]">
                                {rec.title}
                              </span>
                            ) : null}
                          </div>
                          {open && rec.content && (
                            <p className="mt-3 whitespace-pre-wrap border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-foreground)]">
                              {rec.content}
                            </p>
                          )}
                        </button>
                      </div>
                    );
                  })
                ))}

              {tab === "notes" &&
                (notes.length === 0 ? (
                  <p className="app-glass rounded-2xl py-8 text-center text-xs text-[var(--color-muted-fg)]">No clinical notes yet.</p>
                ) : (
                  notes.map((note) => {
                    const open = expanded[`n-${note.id}`];
                    const diag = (note.diagnosis ?? {}) as Record<string, unknown>;
                    const meds = note.medications ?? [];
                    const vitals = note.vitals ?? {};
                    return (
                      <div key={note.id} className="relative">
                        <span aria-hidden="true" className="absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full bg-[#e0a84a] shadow-[0_0_0_3px_rgba(224,168,74,0.25)]" />
                        <div className="app-glass rounded-2xl p-4">
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              onClick={() => toggle(`n-${note.id}`)}
                              aria-expanded={open}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="text-sm font-semibold text-[var(--color-foreground)]">Visit · {fmtDate(note.visit_date)}</p>
                              <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
                                {note.users?.full_name ?? "Doctor"}
                                {note.next_visit_date ? ` · Next visit: ${fmtDate(note.next_visit_date)}` : ""}
                              </p>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingNote(note)}
                              className="focus-ring shrink-0 rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]/60 hover:text-[#e0a84a]"
                              aria-label="Edit note"
                              title="Edit note"
                            >
                              <PenLine size={15} />
                            </button>
                          </div>
                          {open && (
                            <div className="mt-3 space-y-3 border-t border-[var(--color-border)] pt-3 text-xs">
                              {Object.keys(vitals).length > 0 && (
                                <div>
                                  <p className="font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Vitals</p>
                                  <p className="mt-1 text-[var(--color-foreground)]">
                                    {Object.entries(vitals).map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`).join(" · ")}
                                  </p>
                                </div>
                              )}
                              {note.clinical_findings && (
                                <div>
                                  <p className="font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Findings</p>
                                  <p className="mt-1 whitespace-pre-wrap text-[var(--color-foreground)]">{note.clinical_findings}</p>
                                </div>
                              )}
                              {Object.keys(diag).length > 0 && (
                                <div>
                                  <p className="font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Diagnosis</p>
                                  <p className="mt-1 text-[var(--color-foreground)]">
                                    {Object.entries(diag).map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`).join(" · ")}
                                  </p>
                                </div>
                              )}
                              {meds.length > 0 && (
                                <div>
                                  <p className="font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Medications</p>
                                  <ul className="mt-1 space-y-1 text-[var(--color-foreground)]">
                                    {meds.map((m, i) => (
                                      <li key={i}>
                                        {String(m.name ?? m.medication ?? "Medication")}
                                        {m.dosage ? ` — ${m.dosage}` : ""}
                                        {m.frequency ? ` (${m.frequency})` : ""}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {note.treatment_recommendations && (
                                <div>
                                  <p className="font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Recommendations</p>
                                  <p className="mt-1 whitespace-pre-wrap text-[var(--color-foreground)]">{note.treatment_recommendations}</p>
                                </div>
                              )}
                              {note.next_visit_reason && (
                                <p className="text-[var(--color-muted-fg)]">Next visit reason: {note.next_visit_reason}</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ))}

              {tab === "reports" &&
                (reports.length === 0 ? (
                  <p className="app-glass rounded-2xl py-8 text-center text-xs text-[var(--color-muted-fg)]">No medical reports yet.</p>
                ) : (
                  reports.map((rep) => {
                    const open = expanded[`p-${rep.id}`];
                    return (
                      <div key={rep.id} className="relative">
                        <span aria-hidden="true" className="absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full bg-[#e0a84a] shadow-[0_0_0_3px_rgba(224,168,74,0.25)]" />
                        <button
                          type="button"
                          onClick={() => toggle(`p-${rep.id}`)}
                          aria-expanded={open}
                          className="app-glass w-full rounded-2xl p-4 text-left"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-mono text-sm font-semibold text-[var(--color-foreground)]">
                                {rep.reference_number}
                              </p>
                              <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
                                {fmtDate(rep.report_date)}
                                {rep.author_name ? ` · ${rep.author_name}` : ""}
                              </p>
                            </div>
                            <ChevronDown
                              size={16}
                              aria-hidden="true"
                              className={`shrink-0 text-[var(--color-muted-fg)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                            />
                          </div>
                          {open && (
                            <p className="mt-3 whitespace-pre-wrap border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-foreground)]">
                              {rep.content}
                            </p>
                          )}
                        </button>
                      </div>
                    );
                  })
                ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
