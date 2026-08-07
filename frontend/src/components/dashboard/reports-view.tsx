"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, FileText, Loader2, Plus } from "lucide-react";
import { formatDate } from "@/lib/auth";
import type { AppRole } from "@/lib/auth";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

interface PatientOption {
  id: string;
  label: string;
}

interface Report {
  id: string;
  reference_number: string;
  report_date: string;
  content: string;
  author_name: string;
  author_title: string | null;
  created_at: string;
}

export default function ReportsView() {
  const [role, setRole] = useState<AppRole | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setRole(b.data?.claims?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const canWrite = role === "doctor" || role === "hospital_admin" || role === "super_admin";

  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [content, setContent] = useState("");
  const [authorTitle, setAuthorTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const loadPatients = useCallback(async () => {
    try {
      const res = await fetch("/api/patients?pageSize=100&withPortalOnly=false", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load patients");
      const rows = (body.data ?? []) as Array<{ id: string; patient_number: string; first_name: string; last_name: string }>;
      setPatients(rows.map((p) => ({ id: p.id, label: `${p.patient_number} — ${p.first_name} ${p.last_name}` })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load patients");
    }
  }, []);

  const loadReports = useCallback(async (pid: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (pid) params.set("patient_id", pid);
      const res = await fetch(`/api/medical-reports?${params.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load reports");
      setReports(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  useEffect(() => {
    loadReports(selected);
  }, [selected, loadReports]);

  const grouped = useMemo(() => {
    const map = new Map<string, { date: string; reports: Report[] }>();
    for (const r of reports) {
      const key = r.report_date;
      const g = map.get(key) ?? { date: key, reports: [] as Report[] };
      g.reports.push(r);
      map.set(key, g);
    }
    return [...map.values()];
  }, [reports]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId || !content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/medical-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, content, authorTitle: authorTitle || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save report");
      setShowNew(false);
      setPatientId("");
      setContent("");
      setAuthorTitle("");
      if (selected !== body.data.patient_id) setSelected(body.data.patient_id);
      else await loadReports(selected);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed to save report");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Medical reports</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Narrative reports written by doctors, per patient.</p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
          >
            <Plus size={16} aria-hidden="true" /> New Report
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      <div>
        <label className={labelCls} htmlFor="r-patient">Patient</label>
        <select
          id="r-patient"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className={inputCls + " max-w-md"}
        >
          <option value="">All patients</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} aria-hidden="true" className="animate-spin text-[var(--color-muted-fg)]" />
        </div>
      ) : reports.length === 0 ? (
        <p className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-12 text-center text-sm text-[var(--color-muted-fg)] shadow-[var(--shadow-sm)]">
          No medical reports found{selected ? " for this patient" : ""}.
        </p>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <section key={g.date} className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
              <h2 className="border-b border-[var(--color-border)] bg-slate-50 px-4 py-2.5 text-sm font-semibold text-[var(--color-foreground)]">
                {formatDate(g.date)} · {g.reports.length} report(s)
              </h2>
              <ul className="divide-y divide-[var(--color-border)]">
                {g.reports.map((r) => (
                  <li key={r.id}>
                    <details className="group">
                      <summary className="focus-ring flex cursor-pointer list-none items-center gap-2 px-4 py-3 hover:bg-slate-50">
                        <FileText size={15} aria-hidden="true" className="shrink-0 text-[var(--color-primary)]" />
                        <span className="flex-1">
                          <span className="block text-sm font-semibold text-[var(--color-foreground)]">{r.reference_number}</span>
                          <span className="block text-xs text-[var(--color-muted-fg)]">
                            {r.author_name}{r.author_title ? ` · ${r.author_title}` : ""} · {new Date(r.created_at).toLocaleString()}
                          </span>
                        </span>
                        <ChevronDown size={16} aria-hidden="true" className="text-[var(--color-muted-fg)] transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="whitespace-pre-wrap border-t border-[var(--color-border)] bg-[var(--color-muted)]/20 px-4 py-4 text-sm text-[var(--color-foreground)]">
                        {r.content}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <form onSubmit={create} className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--color-foreground)]">Write medical report</h2>
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="focus-ring rounded-lg p-1 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelCls} htmlFor="nr-patient">Patient *</label>
                <select id="nr-patient" required className={inputCls} value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                  <option value="">Select patient…</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="nr-content">Report *</label>
                <textarea id="nr-content" required rows={7} className={inputCls} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Clinical summary, findings, recommendations…" />
              </div>
              <div>
                <label className={labelCls} htmlFor="nr-title">Your title (optional)</label>
                <input id="nr-title" className={inputCls} value={authorTitle} onChange={(e) => setAuthorTitle(e.target.value)} placeholder="e.g. Consulting Cardiologist" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="focus-ring rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="focus-ring rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save report"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}