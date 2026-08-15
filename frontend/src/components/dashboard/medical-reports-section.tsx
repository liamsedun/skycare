"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, FileText, Loader2, Plus, Printer } from "lucide-react";
import { formatDate } from "@/lib/auth";
import type { AppRole } from "@/lib/auth";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

const WRITE_ROLES: AppRole[] = ["hospital_admin", "super_admin", "doctor"];

interface MedicalReport {
  id: string;
  reference_number: string;
  report_date: string;
  content: string;
  author_name: string;
  author_title: string | null;
  created_at: string;
}

interface OrgHeader {
  name: string;
  logo_url: string | null;
  address: string;
  phone: string;
  email: string;
  website: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function printReport(org: OrgHeader, report: MedicalReport, patientName: string) {
  const win = window.open("", "_blank", "width=820,height=1050");
  if (!win) {
    alert("Please allow pop-ups to print the medical report.");
    return;
  }
  const orgName = esc(org.name || "SkyCare Hospital");
  const contact = [org.phone && `Tel: ${esc(org.phone)}`, org.email && `Email: ${esc(org.email)}`, org.website && esc(org.website)].filter(Boolean).join(" &nbsp;&bull;&nbsp; ");
  const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Medical Report ${esc(report.reference_number)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #111; margin: 32px; font-size: 13px; }
  .org-header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 18px; }
  .org-header img { max-height: 56px; object-fit: contain; }
  .org-name { font-size: 18px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-top: 6px; }
  .org-meta { font-size: 11px; color: #333; margin-top: 4px; }
  .title { text-align: center; font-size: 16px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; margin: 10px 0 2px; }
  .ref { display: flex; justify-content: space-between; font-size: 12px; margin: 16px 0; font-weight: 600; }
  .patient-block { border: 1px solid #555; padding: 10px 14px; margin: 10px 0 16px; font-size: 12px; }
  .patient-block p { margin: 3px 0; }
  .content { white-space: pre-wrap; line-height: 1.65; font-size: 13px; min-height: 220px; }
  .sign { margin-top: 40px; }
  .sign .sig-line { border-top: 1px solid #111; width: 240px; margin-top: 46px; }
  .sign p { margin: 2px 0; }
  .footer { margin-top: 34px; font-size: 10px; color: #444; border-top: 1px solid #999; padding-top: 8px; text-align: center; }
</style></head><body>
  <div class="org-header">
    ${org.logo_url ? `<img src="${esc(org.logo_url)}" alt="logo" />` : ""}
    <div class="org-name">${orgName}</div>
    ${org.address ? `<div class="org-meta">${esc(org.address)}</div>` : ""}
    ${contact ? `<div class="org-meta">${contact}</div>` : ""}
  </div>
  <div class="title">Medical Report</div>
  <div class="ref">
    <span>Ref No: ${esc(report.reference_number)}</span>
    <span>Date: ${esc(formatDate(report.report_date))}</span>
  </div>
  <div class="patient-block">
    <p><strong>Patient Name:</strong> ${esc(patientName)}</p>
  </div>
  <div class="content">${esc(report.content)}</div>
  <div class="sign">
    <div class="sig-line"></div>
    <p><strong>${esc(report.author_name)}</strong></p>
    ${report.author_title ? `<p>${esc(report.author_title)}</p>` : ""}
    <p>Signature</p>
  </div>
  <div class="footer">This document is issued by ${orgName}. It is confidential and intended solely for the recipient named.</div>
  <script>window.onload = function(){ window.focus(); setTimeout(function(){ window.print(); }, 250); };</script>
</body></html>`;
  win.document.write(html);
  win.document.close();
}

const EMPTY_ORG: OrgHeader = { name: "", logo_url: null, address: "", phone: "", email: "", website: "" };

export default function MedicalReportsSection({
  patientId,
  patientName,
}: {
  patientId: string;
  patientName: string;
}) {
  const [role, setRole] = useState<AppRole | null>(null);
  const [reports, setReports] = useState<MedicalReport[]>([]);
  const [org, setOrg] = useState<OrgHeader>(EMPTY_ORG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [content, setContent] = useState("");
  const [authorTitle, setAuthorTitle] = useState("");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/medical-reports?patient_id=${patientId}&pageSize=100`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load reports");
      setReports(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setRole(b.data?.claims?.role ?? null))
      .catch(() => setRole(null));
    fetch("/api/tenant/branding", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => {
        if (b.data) {
          setOrg({
            name: b.data.name ?? "",
            logo_url: b.data.logo_url ?? null,
            address: [b.data.address, [b.data.city, b.data.state].filter(Boolean).join(", "), b.data.country]
              .filter(Boolean)
              .join(", "),
            phone: b.data.phone ?? "",
            email: b.data.email ?? "",
            website: b.data.website ?? "",
          });
        }
      })
      .catch(() => {});
    loadReports();
  }, [loadReports]);

  const canWrite = role !== null && WRITE_ROLES.includes(role);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/medical-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          content: content.trim(),
          authorTitle: authorTitle.trim() || null,
          reportDate: reportDate || new Date().toISOString().slice(0, 10),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save report");
      setShowNew(false);
      setContent("");
      setAuthorTitle("");
      setReportDate(new Date().toISOString().slice(0, 10));
      await loadReports();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed to save report");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--color-foreground)]">
          Medical Reports <span className="text-xs font-normal text-[var(--color-muted-fg)]">({reports.length})</span>
        </p>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="focus-ring rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)]"
          >
            {showNew ? "Close form" : "+ New Report"}
          </button>
        )}
      </div>

      {showNew && canWrite && (
        <form
          className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4 sm:grid-cols-2"
          onSubmit={create}
        >
          <div>
            <label className={labelCls} htmlFor="rep-date">Report date</label>
            <input id="rep-date" type="date" className={inputCls} value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="rep-title">Your title (optional)</label>
            <input id="rep-title" className={inputCls} value={authorTitle} onChange={(e) => setAuthorTitle(e.target.value)} placeholder="e.g. Consulting Cardiologist" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="rep-content">Report *</label>
            <textarea id="rep-content" required rows={5} className={inputCls} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Clinical summary, findings, recommendations…" />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
            >
              <Plus size={15} aria-hidden="true" /> {saving ? "Saving…" : "Save report"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} aria-hidden="true" className="animate-spin text-[var(--color-muted-fg)]" />
        </div>
      ) : reports.length === 0 ? (
        <p className="rounded-lg bg-[var(--color-muted)]/40 px-3 py-2 text-xs text-[var(--color-muted-fg)]">
          No medical reports yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li key={r.id} className="rounded-lg border border-[var(--color-border)]">
              <details className="group">
                <summary className="focus-ring flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 hover:bg-slate-50">
                  <FileText size={15} aria-hidden="true" className="shrink-0 text-[var(--color-primary)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[var(--color-foreground)]">{r.reference_number}</span>
                    <span className="block text-xs text-[var(--color-muted-fg)]">
                      {r.author_name}{r.author_title ? ` · ${r.author_title}` : ""} · {formatDate(r.report_date)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      printReport(org, r, patientName);
                    }}
                    className="focus-ring shrink-0 rounded-lg p-1.5 text-[var(--color-muted-fg)] transition-colors hover:bg-white hover:text-[var(--color-primary)]"
                    aria-label={`Print ${r.reference_number}`}
                    title="Print report"
                  >
                    <Printer size={15} aria-hidden="true" />
                  </button>
                  <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-[var(--color-muted-fg)] transition-transform group-open:rotate-180" />
                </summary>
                <div className="whitespace-pre-wrap border-t border-[var(--color-border)] bg-[var(--color-muted)]/20 px-3 py-3 text-sm text-[var(--color-foreground)]">
                  {r.content}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
