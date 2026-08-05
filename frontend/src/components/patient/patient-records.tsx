"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ClipboardList, FileText, Stethoscope } from "lucide-react";

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

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export default function PatientRecords() {
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [notes, setNotes] = useState<DoctorNote[]>([]);
  const [reports, setReports] = useState<MedicalReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-foreground)]">Medical records</h1>
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
          {records.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Records</h2>
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
          )}

          {notes.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Doctor notes</h2>
              {notes.map((note) => {
                const open = expanded[`n-${note.id}`];
                const diag = (note.diagnosis ?? {}) as Record<string, string>;
                const meds = note.medications ?? [];
                const vitals = note.vitals ?? {};
                return (
                  <div key={note.id} className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
                    <button
                      type="button"
                      onClick={() => toggle(`n-${note.id}`)}
                      className="focus-ring flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <Stethoscope size={16} aria-hidden="true" className="text-[var(--color-muted-fg)]" />
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
                      <ChevronDown size={16} aria-hidden="true" className={`text-[var(--color-muted-fg)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                    </button>
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
          )}

          {reports.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Reports</h2>
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
          )}
        </>
      )}
    </div>
  );
}