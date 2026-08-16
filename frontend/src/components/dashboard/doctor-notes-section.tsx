"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, FileText, Loader2, PenLine, Plus, ShieldAlert, Trash2 } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

const CLINICAL_ROLES = ["hospital_admin", "super_admin", "doctor", "nurse"];

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

interface DoctorNote {
  id: string;
  visit_date: string;
  vitals: Record<string, unknown>;
  tests_procedures: Record<string, unknown>;
  clinical_findings: string | null;
  diagnosis: Record<string, unknown>;
  medications: Array<Record<string, unknown>>;
  treatment_recommendations: string | null;
  next_visit_date: string | null;
  next_visit_reason: string | null;
  is_confidential: boolean;
  created_at: string;
  users?: { full_name: string } | null;
}

interface NoteForm {
  visitDate: string;
  vitals: Record<string, string>;
  testsProcedures: Record<string, string>;
  clinicalFindings: string;
  diagnosis: { primary: string; secondary: string; suspected: string };
  medications: Array<{ drug_name: string; dosage: string; frequency: string; duration: string }>;
  treatmentRecommendations: string;
  nextVisitDate: string;
  nextVisitReason: string;
  isConfidential: boolean;
}

function emptyForm(): NoteForm {
  return {
    visitDate: new Date().toISOString().slice(0, 10),
    vitals: {},
    testsProcedures: {},
    clinicalFindings: "",
    diagnosis: { primary: "", secondary: "", suspected: "" },
    medications: [],
    treatmentRecommendations: "",
    nextVisitDate: "",
    nextVisitReason: "",
    isConfidential: true,
  };
}

function formFromNote(n: DoctorNote): NoteForm {
  const v = (n.vitals ?? {}) as Record<string, unknown>;
  const t = (n.tests_procedures ?? {}) as Record<string, unknown>;
  const d = (n.diagnosis ?? {}) as Record<string, unknown>;
  return {
    visitDate: n.visit_date?.slice(0, 10) ?? "",
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
    isConfidential: n.is_confidential,
  };
}

function fmtDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return fmtDate(iso);
}

function ErrorNote({ error }: { error: string }) {
  return (
    <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
      {error}
    </p>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="my-4 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

export default function DoctorNotesSection({ patientId }: { patientId: string }) {
  const [notes, setNotes] = useState<DoctorNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClinician, setIsClinician] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NoteForm>(emptyForm());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const me = await meRes.json();
      const role = me.data?.claims?.role;
      setIsClinician(CLINICAL_ROLES.includes(role));

      const res = await fetch(`/api/doctor-notes?patient_id=${patientId}&pageSize=100`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load doctor notes");
      setNotes(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load doctor notes");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function startNew() {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
    setShowForm(true);
  }

  function startEdit(n: DoctorNote) {
    setEditingId(n.id);
    setForm(formFromNote(n));
    setError(null);
    setShowForm(true);
  }

  function updateVital(key: string, value: string) {
    setForm((f) => ({ ...f, vitals: { ...f.vitals, [key]: value } }));
  }

  function updateTest(key: string, value: string) {
    setForm((f) => ({ ...f, testsProcedures: { ...f.testsProcedures, [key]: value } }));
  }

  function updateDiagnosis(key: "primary" | "secondary" | "suspected", value: string) {
    setForm((f) => ({ ...f, diagnosis: { ...f.diagnosis, [key]: value } }));
  }

  function addMedication() {
    setForm((f) => ({ ...f, medications: [...f.medications, { drug_name: "", dosage: "", frequency: "", duration: "" }] }));
  }

  function updateMedication(i: number, patch: Partial<{ drug_name: string; dosage: string; frequency: string; duration: string }>) {
    setForm((f) => {
      const meds = [...f.medications];
      meds[i] = { ...meds[i], ...patch };
      return { ...f, medications: meds };
    });
  }

  function removeMedication(i: number) {
    setForm((f) => ({ ...f, medications: f.medications.filter((_, idx) => idx !== i) }));
  }

  function buildPayload() {
    const meds = form.medications.filter((m) => m.drug_name.trim());
    const payload: Record<string, unknown> = {
      visitDate: form.visitDate,
      vitals: Object.fromEntries(Object.entries(form.vitals).filter(([, v]) => v)),
      testsProcedures: Object.fromEntries(Object.entries(form.testsProcedures).filter(([, v]) => v)),
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
      isConfidential: form.isConfidential,
    };
    return payload;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = buildPayload();
      const res = await fetch(editingId ? `/api/doctor-notes/${editingId}` : "/api/doctor-notes", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? payload : { ...payload, patientId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save note");
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed to save note");
    } finally {
      setBusy(false);
    }
  }

  async function remove(noteId: string) {
    if (!confirm("Delete this clinical note? This action cannot be undone.")) return;
    setError(null);
    try {
      const res = await fetch(`/api/doctor-notes/${noteId}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete note");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete note");
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]">
          <FileText size={15} aria-hidden="true" /> Doctor Notes
          <span className="text-xs font-normal text-[var(--color-muted-fg)]">({notes.length})</span>
        </h3>
        {isClinician && (
          <button
            type="button"
            onClick={startNew}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)]"
          >
            <Plus size={13} aria-hidden="true" /> New Note
          </button>
        )}
      </div>

      {error && <div className="mb-3"><ErrorNote error={error} /></div>}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} aria-hidden="true" className="animate-spin text-[var(--color-muted-fg)]" />
        </div>
      ) : notes.length === 0 ? (
        <p className="rounded-lg bg-[var(--color-muted)]/40 px-3 py-2 text-xs text-[var(--color-muted-fg)]">
          No doctor notes yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => {
            const open = expanded[note.id];
            const vitals = note.vitals ?? {};
            const tests = note.tests_procedures ?? {};
            const diag = note.diagnosis ?? {};
            const meds = note.medications ?? [];
            return (
              <li key={note.id} className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
                <div className="flex items-center gap-2 px-4 py-3">
                  <button type="button" onClick={() => toggle(note.id)} className="focus-ring flex w-full min-w-0 items-center justify-between gap-3 text-left">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">
                        Visit · {fmtDate(note.visit_date)}
                        {note.is_confidential && (
                          <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-red-100 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase text-red-700">
                            <ShieldAlert size={10} aria-hidden="true" /> Confidential
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-[var(--color-muted-fg)]">
                        {note.users?.full_name ?? "Doctor"} · {timeAgo(note.created_at)}
                        {note.next_visit_date ? ` · Next visit: ${fmtDate(note.next_visit_date)}` : ""}
                      </p>
                    </div>
                    <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-[var(--color-muted-fg)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                  </button>
                  {isClinician && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(note)}
                        className="focus-ring rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-slate-100 hover:text-[var(--color-primary)]"
                        aria-label="Edit note"
                      >
                        <PenLine size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(note.id)}
                        className="focus-ring rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-rose-50 hover:text-[var(--color-destructive)]"
                        aria-label="Delete note"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
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
                    {Object.keys(tests).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Tests / Procedures</p>
                        <p className="mt-1 text-[var(--color-foreground)]">
                          {Object.entries(tests).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}
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
                          {Object.entries(diag).map(([k, v]) => `${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" · ")}
                        </p>
                      </div>
                    )}
                    {meds.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Medications</p>
                        <ul className="mt-1 space-y-1 text-[var(--color-foreground)]">
                          {meds.map((m, i) => (
                            <li key={i}>
                              {String(m.drug_name ?? m.name ?? m.medication ?? "Medication")}
                              {m.dosage ? ` — ${m.dosage}` : ""}
                              {m.frequency ? ` (${m.frequency})` : ""}
                              {m.duration ? ` · ${m.duration}` : ""}
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
                      <p className="text-xs text-[var(--color-muted-fg)]">Next visit reason: {note.next_visit_reason}</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showForm && (
        <Modal title={editingId ? "Edit Clinical Note" : "New Clinical Note"} onClose={() => setShowForm(false)}>
          <form onSubmit={save} className="space-y-5">
            {error && <ErrorNote error={error} />}

            <div>
              <label className={labelCls} htmlFor="dn-date">Visit date</label>
              <input id="dn-date" type="date" required className={inputCls} value={form.visitDate} onChange={(e) => setForm((f) => ({ ...f, visitDate: e.target.value }))} />
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">1. Vital signs & measurements</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {VITAL_FIELDS.map((f) => (
                  <div key={f.key}>
                    <label className={labelCls} htmlFor={`dn-v-${f.key}`}>{f.label}</label>
                    <input id={`dn-v-${f.key}`} className={inputCls} placeholder={f.placeholder} value={form.vitals[f.key] ?? ""} onChange={(e) => updateVital(f.key, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">2. Tests / procedures conducted</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {TEST_FIELDS.map((f) => (
                  <div key={f.key}>
                    <label className={labelCls} htmlFor={`dn-t-${f.key}`}>{f.label}</label>
                    <input id={`dn-t-${f.key}`} className={inputCls} placeholder="Result / notes" value={form.testsProcedures[f.key] ?? ""} onChange={(e) => updateTest(f.key, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className={labelCls} htmlFor="dn-findings">3. Clinical findings / observations</label>
              <textarea id="dn-findings" rows={3} className={inputCls} placeholder="Patient complaints, examination findings, notable abnormalities…" value={form.clinicalFindings} onChange={(e) => setForm((f) => ({ ...f, clinicalFindings: e.target.value }))} />
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">4. Diagnosis / assessment</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls} htmlFor="dn-d-primary">Primary</label>
                  <input id="dn-d-primary" className={inputCls} placeholder="e.g. Type 2 diabetes" value={form.diagnosis.primary} onChange={(e) => updateDiagnosis("primary", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="dn-d-secondary">Secondary (comma-separated)</label>
                  <input id="dn-d-secondary" className={inputCls} placeholder="e.g. Hypertension" value={form.diagnosis.secondary} onChange={(e) => updateDiagnosis("secondary", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="dn-d-suspected">Suspected (comma-separated)</label>
                  <input id="dn-d-suspected" className={inputCls} placeholder="e.g. Sleep apnea" value={form.diagnosis.suspected} onChange={(e) => updateDiagnosis("suspected", e.target.value)} />
                </div>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">5. Medications prescribed</p>
              <div className="space-y-2">
                {form.medications.map((m, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-3 sm:grid-cols-5">
                    <input className={inputCls} placeholder="Drug name" value={m.drug_name} onChange={(e) => updateMedication(i, { drug_name: e.target.value })} />
                    <input className={inputCls} placeholder="Dosage" value={m.dosage} onChange={(e) => updateMedication(i, { dosage: e.target.value })} />
                    <input className={inputCls} placeholder="Frequency" value={m.frequency} onChange={(e) => updateMedication(i, { frequency: e.target.value })} />
                    <input className={inputCls} placeholder="Duration" value={m.duration} onChange={(e) => updateMedication(i, { duration: e.target.value })} />
                    <button
                      type="button"
                      onClick={() => removeMedication(i)}
                      className="focus-ring rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addMedication}
                  className="focus-ring rounded-lg border border-dashed border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)]"
                >
                  + Add medication
                </button>
              </div>
            </div>

            <div>
              <label className={labelCls} htmlFor="dn-treat">6. Treatment / recommendations</label>
              <textarea id="dn-treat" rows={3} className={inputCls} placeholder="Lifestyle advice, referrals, follow-up tests…" value={form.treatmentRecommendations} onChange={(e) => setForm((f) => ({ ...f, treatmentRecommendations: e.target.value }))} />
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">7. Next visit</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="dn-next-date">Next appointment date</label>
                  <input id="dn-next-date" type="date" className={inputCls} value={form.nextVisitDate} onChange={(e) => setForm((f) => ({ ...f, nextVisitDate: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="dn-next-reason">Reason for follow-up</label>
                  <input id="dn-next-reason" className={inputCls} placeholder="e.g. Review test results" value={form.nextVisitReason} onChange={(e) => setForm((f) => ({ ...f, nextVisitReason: e.target.value }))} />
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isConfidential}
                onChange={(e) => setForm((f) => ({ ...f, isConfidential: e.target.checked }))}
                className="h-4 w-4 rounded border-[var(--color-border)] accent-red-500"
              />
              <span className="flex items-center gap-1 font-medium text-[var(--color-foreground)]">
                <ShieldAlert size={14} aria-hidden="true" /> Confidential (hidden from patient portal)
              </span>
            </label>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
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
                {busy ? "Saving…" : editingId ? "Save Changes" : "Save Note"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
