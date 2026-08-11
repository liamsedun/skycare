"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Save, X } from "lucide-react";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

interface StaffRow {
  id: string;
  staff_number: string;
  department: string | null;
  specialization: string | null;
  employment_type: string | null;
  base_salary: number | null;
  is_available: boolean;
  on_leave_until: string | null;
  users: { full_name: string; role: string; email: string; phone: string | null; is_active: boolean } | null;
  profiles: Array<{ id: string; hire_date: string | null; salary_grade: string | null; bank_name: string | null; credentials_status: string }> | null;
}

const CRED_BADGE: Record<string, string> = {
  verified: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  expired: "bg-rose-100 text-rose-700",
};

const fmtN = (n: number | null | undefined) => (n == null ? "—" : `₦${n.toLocaleString()}`);
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function HrStaffView() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ hire_date: "", salary_grade: "", bank_name: "", bank_account_name: "", bank_account_number: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const me = await meRes.json();
      setIsAdmin(["hospital_admin", "hr_officer", "super_admin"].includes(me.data?.claims?.role));
      const params = new URLSearchParams({ pageSize: "200" });
      if (q) params.set("q", q);
      if (role) params.set("role", role);
      const res = await fetch(`/api/hr/staff?${params}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load staff");
      setRows(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load staff");
    } finally {
      setLoading(false);
    }
  }, [q, role]);

  useEffect(() => {
    load();
  }, [load]);

  async function openDetail(id: string) {
    try {
      const res = await fetch(`/api/hr/staff/${id}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load profile");
      setDetail(body.data);
      const p = (body.data?.profiles as Array<Record<string, unknown>> | undefined)?.[0];
      setEditForm({
        hire_date: String(p?.hire_date ?? "").slice(0, 10),
        salary_grade: String(p?.salary_grade ?? ""),
        bank_name: String(p?.bank_name ?? ""),
        bank_account_name: String(p?.bank_account_name ?? ""),
        bank_account_number: String(p?.bank_account_number ?? ""),
      });
      setEditMode(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile");
    }
  }

  async function saveProfile() {
    if (!detail) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/hr/staff/${String(detail.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save profile");
      setEditMode(false);
      await openDetail(String(detail.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  const HR_STAFF_EXPORT_COLUMNS = [
    "staff_number",
    "full_name",
    "email",
    "phone",
    "role",
    "department",
    "specialization",
    "employment_type",
    "base_salary",
    "hire_date",
    "salary_grade",
    "credentials_status",
  ];

  function hrStaffRows() {
    return rows.map((r) => {
      const p = r.profiles?.[0];
      return [
        r.staff_number,
        r.users?.full_name ?? "",
        r.users?.email ?? "",
        r.users?.phone ?? "",
        r.users?.role ?? "",
        r.department ?? "",
        r.specialization ?? "",
        r.employment_type ?? "",
        r.base_salary ?? "",
        p?.hire_date ?? "",
        p?.salary_grade ?? "",
        p?.credentials_status ?? "",
      ];
    });
  }

  function exportHrStaffCsv() {
    if (rows.length === 0) {
      alert("Nothing to export — there are no staff profiles yet.");
      return;
    }
    downloadCsv(`hr-staff-${dateStamp()}.csv`, HR_STAFF_EXPORT_COLUMNS, hrStaffRows());
  }

  function exportHrStaffPdf() {
    if (rows.length === 0) {
      alert("Nothing to export — there are no staff profiles yet.");
      return;
    }
    printTable("HR Staff Profiles", HR_STAFF_EXPORT_COLUMNS, hrStaffRows());
  }

  const HR_STAFF_IMPORT_COLUMNS = ["staff_id", "hire_date", "salary_grade", "bank_name", "bank_account_name", "bank_account_number"];

  async function importHrStaff(importRows: string[][]): Promise<ImportResult> {
    const errors: string[] = [];
    let created = 0;
    for (let i = 0; i < importRows.length; i++) {
      const r = importRows[i];
      const rowNo = i + 2;
      const staff_id = r[0]?.trim() ?? "";
      if (!staff_id) {
        errors.push(`Row ${rowNo}: staff_id is required`);
        continue;
      }
      try {
        const res = await fetch("/api/hr/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            staff_id,
            hire_date: r[1]?.trim() || null,
            salary_grade: r[2]?.trim() || undefined,
            bank_name: r[3]?.trim() || undefined,
            bank_account_name: r[4]?.trim() || undefined,
            bank_account_number: r[5]?.trim() || undefined,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to create HR profile");
        created++;
      } catch (e) {
        errors.push(
          `Row ${rowNo}: ${e instanceof Error ? e.message : "Failed to create HR profile"}`
        );
      }
    }
    return { created, failed: errors.length, errors };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className={inputCls + " max-w-xs"}
          placeholder="Search name / staff number…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className={inputCls + " max-w-[180px]"} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          {[...new Set(rows.map((r) => r.users?.role).filter(Boolean))].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <ImportExportMenu
          entityLabel="Staff Profiles"
          exportCsv={exportHrStaffCsv}
          exportPdf={exportHrStaffPdf}
          importColumns={HR_STAFF_IMPORT_COLUMNS}
          importSample={[["<staff_id>", "2024-03-01", "GL 08", "GTBank", "Ada Okafor", "0123456789"]]}
          templateFilename="hr-staff-import-template.csv"
          onImport={importHrStaff}
          onImported={() => load()}
        />
        <span className="text-sm text-[var(--color-muted-fg)]">{rows.length} staff</span>
      </div>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--color-muted-fg)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading staff…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-xs uppercase text-[var(--color-muted-fg)]">
              <tr>
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Base salary</th>
                <th className="px-4 py-3">Hired</th>
                <th className="px-4 py-3">Grade</th>
                <th className="px-4 py-3">Credentials</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((r) => {
                const p = r.profiles?.[0];
                return (
                  <tr key={r.id} className="hover:bg-[var(--color-muted)]">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.users?.full_name}</div>
                      <div className="text-xs text-[var(--color-muted-fg)]">{r.users?.role} · {r.staff_number}{r.users?.is_active === false && " · disabled"}</div>
                    </td>
                    <td className="px-4 py-3">{r.department ?? "—"}</td>
                    <td className="px-4 py-3">{r.employment_type ?? "—"}</td>
                    <td className="px-4 py-3">{fmtN(r.base_salary)}</td>
                    <td className="px-4 py-3">{fmtDate(p?.hire_date)}</td>
                    <td className="px-4 py-3">{p?.salary_grade ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CRED_BADGE[p?.credentials_status ?? "pending"]}`}>
                        {p?.credentials_status ?? "pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--color-muted)]"
                        onClick={() => openDetail(r.id)}
                      >
                        <Pencil className="h-3.5 w-3.5" /> View
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-[var(--color-muted-fg)]">No staff found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{(detail.users as { full_name?: string })?.full_name}</h3>
                <p className="text-sm text-[var(--color-muted-fg)]">
                  {(detail.users as { role?: string })?.role} · {String(detail.staff_number ?? "")} · {String(detail.department ?? "—")}
                </p>
              </div>
              <button className="rounded-lg p-1.5 hover:bg-[var(--color-muted)]" onClick={() => setDetail(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <h4 className="mb-2 text-sm font-semibold uppercase text-[var(--color-muted-fg)]">HR profile</h4>
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--color-border)] p-4 text-sm sm:grid-cols-3">
              <div><span className="block text-xs text-[var(--color-muted-fg)]">Employment</span>{String(detail.employment_type ?? "—")}</div>
              <div><span className="block text-xs text-[var(--color-muted-fg)]">Base salary</span>{fmtN(detail.base_salary as number | null)}</div>
              <div><span className="block text-xs text-[var(--color-muted-fg)]">Hire date</span>{fmtDate((detail.profiles as Array<{ hire_date: string | null }> | undefined)?.[0]?.hire_date)}</div>
              <div><span className="block text-xs text-[var(--color-muted-fg)]">Grade</span>{String((detail.profiles as Array<{ salary_grade: string | null }> | undefined)?.[0]?.salary_grade ?? "—")}</div>
              <div><span className="block text-xs text-[var(--color-muted-fg)]">Bank</span>{String((detail.profiles as Array<{ bank_name: string | null }> | undefined)?.[0]?.bank_name ?? "—")}</div>
              <div><span className="block text-xs text-[var(--color-muted-fg)]">Credentials</span>{String((detail.profiles as Array<{ credentials_status: string }> | undefined)?.[0]?.credentials_status ?? "—")}</div>
            </div>

            {isAdmin && (
              <>
                <div className="mt-3 flex justify-end">
                  <button
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--color-muted)]"
                    onClick={() => (editMode ? setEditMode(false) : setEditMode(true))}
                  >
                    <Pencil className="h-3.5 w-3.5" /> {editMode ? "Cancel" : "Edit profile"}
                  </button>
                </div>
                {editMode && (
                  <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-[var(--color-border)] p-4 text-sm sm:grid-cols-3">
                    <div>
                      <label className={labelCls}>Hire date</label>
                      <input type="date" className={inputCls} value={editForm.hire_date} onChange={(e) => setEditForm({ ...editForm, hire_date: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Salary grade</label>
                      <input className={inputCls} value={editForm.salary_grade} onChange={(e) => setEditForm({ ...editForm, salary_grade: e.target.value })} placeholder="e.g. GL 08" />
                    </div>
                    <div>
                      <label className={labelCls}>Bank</label>
                      <input className={inputCls} value={editForm.bank_name} onChange={(e) => setEditForm({ ...editForm, bank_name: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Account name</label>
                      <input className={inputCls} value={editForm.bank_account_name} onChange={(e) => setEditForm({ ...editForm, bank_account_name: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Account number</label>
                      <input className={inputCls} value={editForm.bank_account_number} onChange={(e) => setEditForm({ ...editForm, bank_account_number: e.target.value })} />
                    </div>
                    <div className="flex items-end">
                      <button
                        className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-[var(--color-primary)] px-3 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                        onClick={saveProfile}
                        disabled={saving}
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            <h4 className="mb-2 mt-5 text-sm font-semibold uppercase text-[var(--color-muted-fg)]">Credentials</h4>
            <div className="space-y-2">
              {(detail.credentials as Array<Record<string, unknown>> | undefined)?.map((c) => (
                <div key={String(c.id)} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
                  <div>
                    <b>{String(c.certification)}</b> <span className="text-[var(--color-muted-fg)]">· {String(c.license_number ?? "—")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--color-muted-fg)]">exp {fmtDate(c.expiry_date as string)}</span>
                    {c.verified ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">verified</span> : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">unverified</span>}
                  </div>
                </div>
              ))}
              {(detail.credentials as Array<unknown> | undefined)?.length === 0 && <p className="text-sm text-[var(--color-muted-fg)]">No credentials recorded.</p>}
            </div>

            <h4 className="mb-2 mt-5 text-sm font-semibold uppercase text-[var(--color-muted-fg)]">Payroll history</h4>
            <div className="space-y-2">
              {(detail.payroll as Array<Record<string, unknown>> | undefined)?.map((p) => (
                <div key={String(p.id)} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
                  <span>{String(p.pay_period)} · {String(p.worked_days)} worked · {String(p.absent_days)} absent · {Number(p.overtime_hours)}h OT</span>
                  <b>{fmtN(Number(p.net_salary))}</b>
                </div>
              ))}
              {(detail.payroll as Array<unknown> | undefined)?.length === 0 && <p className="text-sm text-[var(--color-muted-fg)]">No payroll yet.</p>}
            </div>

            <h4 className="mb-2 mt-5 text-sm font-semibold uppercase text-[var(--color-muted-fg)]">Leave balances</h4>
            <div className="space-y-2">
              {(detail.leave_balances as Array<Record<string, unknown>> | undefined)?.map((b) => (
                <div key={String(b.id ?? `${b.leave_type}-${b.leave_year}`)} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
                  <span>{String(b.leave_type)} {String(b.leave_year)}</span>
                  <b>{Number(b.used_days)}/{Number(b.entitled_days)}</b>
                </div>
              ))}
              {(detail.leave_balances as Array<unknown> | undefined)?.length === 0 && <p className="text-sm text-[var(--color-muted-fg)]">No balances yet.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
