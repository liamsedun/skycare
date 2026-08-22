"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Pencil, Plus, Save, X } from "lucide-react";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";
import { mutedXs, mutedFg, divideBorder, flexGap2, mutedSmPlain, spinner, rowStart } from "@/lib/ui-constants";
import DateRangeBar from "@/components/filters/date-range-bar";

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
  profiles: { id: string; hire_date: string | null; salary_grade: string | null; bank_name: string | null; bank_account_name: string | null; bank_account_number: string | null; credentials_status: string } | null;
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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [role, setRole] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ hire_date: "", salary_grade: "", employment_type: "full_time", base_salary: "", bank_name: "", bank_account_name: "", bank_account_number: "" });
  const [payCfg, setPayCfg] = useState<Record<string, unknown>>({});
  const [payCfgOpen, setPayCfgOpen] = useState(false);
  const [payCfgMsg, setPayCfgMsg] = useState<string | null>(null);
  const [leaveEdits, setLeaveEdits] = useState<Record<string, number>>({});
  const [savedLeave, setSavedLeave] = useState<Record<string, boolean>>({});
  const [savingLeave, setSavingLeave] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
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
      const p = (body.data?.profiles as Record<string, unknown> | null | undefined) ?? null;
      setEditForm({
        hire_date: String(p?.hire_date ?? "").slice(0, 10),
        salary_grade: String(p?.salary_grade ?? ""),
        employment_type: String(body.data?.employment_type ?? "full_time") || "full_time",
        base_salary: String(body.data?.base_salary ?? ""),
        bank_name: String(p?.bank_name ?? ""),
        bank_account_name: String(p?.bank_account_name ?? ""),
        bank_account_number: String(p?.bank_account_number ?? ""),
      });
      setSaveMsg(null);
      setEditMode(false);
      setPayCfg({
        pensionable_portion_pct: (p as Record<string, unknown>)?.pensionable_portion_pct ?? 80,
        pension_rate_pct: (p as Record<string, unknown>)?.pension_rate_pct ?? 8,
        nhis_applicable: (p as Record<string, unknown>)?.nhis_applicable === true,
        nhf_applicable: (p as Record<string, unknown>)?.nhf_applicable !== false,
        basic_salary_pct: (p as Record<string, unknown>)?.basic_salary_pct ?? 50,
        housing_pct: (p as Record<string, unknown>)?.housing_pct ?? 20,
        transport_pct: (p as Record<string, unknown>)?.transport_pct ?? 10,
        utilities_pct: (p as Record<string, unknown>)?.utilities_pct ?? 10,
        meals_pct: (p as Record<string, unknown>)?.meals_pct ?? 5,
        others_pct: (p as Record<string, unknown>)?.others_pct ?? 5,
        annual_rent: (p as Record<string, unknown>)?.annual_rent ?? 0,
        annual_mortgage_interest: (p as Record<string, unknown>)?.annual_mortgage_interest ?? 0,
        annual_life_assurance: (p as Record<string, unknown>)?.annual_life_assurance ?? 0,
        internal_deductions: Array.isArray((p as Record<string, unknown>)?.internal_deductions)
          ? (p as Record<string, unknown>).internal_deductions
          : [],
        pension_pin: (p as Record<string, unknown>)?.pension_pin ?? "",
        nhf_number: (p as Record<string, unknown>)?.nhf_number ?? "",
        tax_id: (p as Record<string, unknown>)?.tax_id ?? "",
      });
      setPayCfgOpen(false);
      setPayCfgMsg(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile");
    }
  }

  async function saveProfile() {
    if (!detail) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/hr/staff/${String(detail.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hire_date: editForm.hire_date || null,
          salary_grade: editForm.salary_grade,
          employment_type: editForm.employment_type || null,
          baseSalary: editForm.base_salary === "" ? null : Number(editForm.base_salary),
          bank_name: editForm.bank_name,
          bank_account_name: editForm.bank_account_name,
          bank_account_number: editForm.bank_account_number,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save profile");
      setEditMode(false);
      await openDetail(String(detail.id));
      setSaveMsg("Profile saved ✓");
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  async function savePayrollCfg() {
    if (!detail) return;
    setSaving(true);
    setPayCfgMsg(null);
    try {
      const res = await fetch(`/api/hr/staff/${String(detail.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payCfg),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save payroll settings");
      setPayCfgMsg("Payroll settings saved ✓");
      await openDetail(String(detail.id));
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save payroll settings");
    } finally {
      setSaving(false);
    }
  }

  const visibleRows = rows.filter((r) => inDateRange(r.profiles?.hire_date, from, to));

  const HR_STAFF_EXPORT_COLUMNS = [
    "staff_id",
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
    "bank_name",
    "bank_account_name",
    "bank_account_number",
    "credentials_status",
  ];

  function hrStaffRows() {
    return rows.map((r) => {
      const p = r.profiles ?? null;
      return [
        r.id,
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
        p?.bank_name ?? "",
        p?.bank_account_name ?? "",
        p?.bank_account_number ?? "",
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

  const HR_STAFF_IMPORT_COLUMNS = [
    "staff_id",
    "employment_type",
    "base_salary",
    "hire_date",
    "salary_grade",
    "bank_name",
    "bank_account_name",
    "bank_account_number",
    "pensionable_portion_pct",
    "pension_rate_pct",
    "nhis_applicable",
    "nhf_applicable",
    "basic_salary_pct",
    "housing_pct",
    "transport_pct",
    "utilities_pct",
    "meals_pct",
    "others_pct",
    "annual_rent",
    "annual_mortgage_interest",
    "annual_life_assurance",
    "internal_deductions",
    "pension_pin",
    "nhf_number",
    "tax_id",
  ];

  const HR_STAFF_IMPORT_SAMPLE = [
    "<staff_id>",
    "full_time",
    "200000",
    "2026-03-01",
    "GL 08",
    "GTBank",
    "Ada Okafor",
    "0123456789",
    "80",
    "8",
    "false",
    "true",
    "50",
    "20",
    "10",
    "10",
    "5",
    "5",
    "500000",
    "0",
    "0",
    "Staff housing:25000;Loan:10000",
    "PEN1001221212121",
    "0123456789",
    "N-5412325",
  ];

  async function importHrStaff(importRows: string[][]): Promise<ImportResult> {
    const errors: string[] = [];
    let created = 0;
    let updated = 0;
    for (let i = 0; i < importRows.length; i++) {
      const r = importRows[i];
      const rowNo = i + 2;
      const staff_id = r[0]?.trim() ?? "";
      if (!staff_id) {
        errors.push(`Row ${rowNo}: staff_id is required`);
        continue;
      }
      const cell = (idx: number) => (idx < r.length ? r[idx]?.trim() ?? "" : "");
      const body: Record<string, string> = {};
      const keys: [number, string][] = [
        [1, "employment_type"],
        [2, "base_salary"],
        [3, "hire_date"],
        [4, "salary_grade"],
        [5, "bank_name"],
        [6, "bank_account_name"],
        [7, "bank_account_number"],
        [8, "pensionable_portion_pct"],
        [9, "pension_rate_pct"],
        [10, "nhis_applicable"],
        [11, "nhf_applicable"],
        [12, "basic_salary_pct"],
        [13, "housing_pct"],
        [14, "transport_pct"],
        [15, "utilities_pct"],
        [16, "meals_pct"],
        [17, "others_pct"],
        [18, "annual_rent"],
        [19, "annual_mortgage_interest"],
        [20, "annual_life_assurance"],
        [21, "internal_deductions"],
        [22, "pension_pin"],
        [23, "nhf_number"],
        [24, "tax_id"],
      ];
      for (const [idx, key] of keys) {
        const v = cell(idx);
        if (v !== "") body[key] = v;
      }
      try {
        const res = await fetch("/api/hr/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ staff_id, ...body }),
        });
        const resBody = await res.json();
        if (!res.ok) throw new Error(resBody.error ?? "Failed to import HR profile");
        if (resBody.data?.created === false) updated++;
        else created++;
      } catch (e) {
        errors.push(`Row ${rowNo}: ${e instanceof Error ? e.message : "Failed to import HR profile"}`);
      }
    }
    const notes: string[] = [];
    if (updated > 0) notes.push(`${updated} existing profile(s) updated with the imported values.`);
    return { created, failed: errors.length, errors, notes };
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
        <DateRangeBar
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          onClear={() => { setFrom(""); setTo(""); }}
        />
        <ImportExportMenu
          entityLabel="Staff Profiles"
          exportCsv={exportHrStaffCsv}
          exportPdf={exportHrStaffPdf}
          importColumns={HR_STAFF_IMPORT_COLUMNS}
          importSample={[HR_STAFF_IMPORT_SAMPLE]}
          templateFilename="hr-staff-import-template.csv"
          onImport={importHrStaff}
          onImported={() => load()}
        />
        <span className={mutedSmPlain}>{visibleRows.length} staff</span>
      </div>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--color-muted-fg)]">
          <Loader2 className={spinner} /> Loading staff…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white">
          <table className={rowStart}>
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
            <tbody className={divideBorder}>
              {visibleRows.map((r) => {
                const p = r.profiles ?? null;
                return (
                  <tr key={r.id} className="hover:bg-[var(--color-muted)]">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.users?.full_name}</div>
                      <div className={mutedXs}>{r.users?.role} · {r.staff_number}{r.users?.is_active === false && " · disabled"}</div>
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
              {visibleRows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-[var(--color-muted-fg)]">{rows.length === 0 ? "No staff found." : "No staff match the current filters."}</td></tr>
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
                <p className={mutedSmPlain}>
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
              <div><span className="block text-xs text-[var(--color-muted-fg)]">Hire date</span>{fmtDate((detail.profiles as { hire_date?: string | null } | null)?.hire_date)}</div>
              <div><span className="block text-xs text-[var(--color-muted-fg)]">Grade</span>{String((detail.profiles as { salary_grade?: string | null } | null)?.salary_grade ?? "—")}</div>
              <div><span className="block text-xs text-[var(--color-muted-fg)]">Bank</span>{String((detail.profiles as { bank_name?: string | null } | null)?.bank_name ?? "—")}</div>
              <div><span className="block text-xs text-[var(--color-muted-fg)]">Credentials</span>{String((detail.profiles as { credentials_status?: string } | null)?.credentials_status ?? "—")}</div>
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
                  <>
                    {saveMsg && <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{saveMsg}</div>}
                    <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-[var(--color-border)] p-4 text-sm sm:grid-cols-3">
                      <div>
                        <label className={labelCls}>Employment type</label>
                        <select className={inputCls} value={editForm.employment_type} onChange={(e) => setEditForm({ ...editForm, employment_type: e.target.value })}>
                          <option value="full_time">Full time</option>
                          <option value="part_time">Part time</option>
                          <option value="contract">Contract</option>
                          <option value="locum">Locum</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Hire date</label>
                        <input type="date" className={inputCls} value={editForm.hire_date} onChange={(e) => setEditForm({ ...editForm, hire_date: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Grade level</label>
                        <input className={inputCls} value={editForm.salary_grade} onChange={(e) => setEditForm({ ...editForm, salary_grade: e.target.value })} placeholder="e.g. GL 08" />
                      </div>
                      <div>
                        <label className={labelCls}>Base salary (₦)</label>
                        <input type="number" min={0} className={inputCls} value={editForm.base_salary} onChange={(e) => setEditForm({ ...editForm, base_salary: e.target.value })} placeholder="0.00" />
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
                          {saving ? <Loader2 className={spinner} /> : <Save className="h-4 w-4" />} Save
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {isAdmin && (
              <>
                <div className="mt-5 flex items-center justify-between">
                  <h4 className="text-sm font-semibold uppercase text-[var(--color-muted-fg)]">Payroll settings</h4>
                  <button className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--color-muted)]" onClick={() => setPayCfgOpen(!payCfgOpen)}>
                    {payCfgOpen ? "Hide" : "Edit"}
                  </button>
                </div>
                {payCfgOpen ? (
                  <div className="mt-2 rounded-xl border border-[var(--color-border)] p-3">
                    {payCfgMsg && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{payCfgMsg}</div>}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {([
                        ["pensionable_portion_pct", "Pensionable base %"],
                        ["pension_rate_pct", "Pension rate %"],
                        ["basic_salary_pct", "Basic %"],
                        ["housing_pct", "Housing %"],
                        ["transport_pct", "Transport %"],
                        ["utilities_pct", "Utilities %"],
                        ["meals_pct", "Meals %"],
                        ["others_pct", "Other %"],
                      ] as [string, string][]).map(([key, label]) => (
                        <div key={key}>
                          <label className="block text-[11px] text-[var(--color-muted-fg)]">{label}</label>
                          <input
                            type="number" min={0} max={100}
                            className={inputCls + " mt-0.5 px-2 py-1.5 text-xs"}
                            value={Number(payCfg[key] ?? 0)}
                            onChange={(e) => setPayCfg({ ...payCfg, [key]: Number(e.target.value) })}
                          />
                        </div>
                      ))}
                      <div>
                        <label className="block text-[11px] text-[var(--color-muted-fg)]">Annual rent (₦)</label>
                        <input type="number" min={0} className={inputCls + " mt-0.5 px-2 py-1.5 text-xs"} value={Number(payCfg.annual_rent ?? 0)} onChange={(e) => setPayCfg({ ...payCfg, annual_rent: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[var(--color-muted-fg)]">Mortgage interest (₦)</label>
                        <input type="number" min={0} className={inputCls + " mt-0.5 px-2 py-1.5 text-xs"} value={Number(payCfg.annual_mortgage_interest ?? 0)} onChange={(e) => setPayCfg({ ...payCfg, annual_mortgage_interest: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[var(--color-muted-fg)]">Life assurance (₦)</label>
                        <input type="number" min={0} className={inputCls + " mt-0.5 px-2 py-1.5 text-xs"} value={Number(payCfg.annual_life_assurance ?? 0)} onChange={(e) => setPayCfg({ ...payCfg, annual_life_assurance: Number(e.target.value) })} />
                      </div>
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={payCfg.nhis_applicable === true} onChange={(e) => setPayCfg({ ...payCfg, nhis_applicable: e.target.checked })} />
                        NHIS applicable
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={payCfg.nhf_applicable !== false} onChange={(e) => setPayCfg({ ...payCfg, nhf_applicable: e.target.checked })} />
                        NHF applicable
                      </label>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {(["pension_pin", "nhf_number", "tax_id"] as const).map((key) => (
                        <div key={key}>
                          <label className="block text-[11px] text-[var(--color-muted-fg)]">{key.replace(/_/g, " ")}</label>
                          <input className={inputCls + " mt-0.5 px-2 py-1.5 text-xs"} value={String(payCfg[key] ?? "")} onChange={(e) => setPayCfg({ ...payCfg, [key]: e.target.value })} />
                        </div>
                      ))}
                    </div>
                    <h5 className="mb-1 mt-3 text-[11px] font-semibold uppercase text-[var(--color-muted-fg)]">Internal deductions</h5>
                    <div className="space-y-1.5">
                      {(Array.isArray(payCfg.internal_deductions) ? payCfg.internal_deductions : []).map((d, i) => {
                        const dd = d as { description?: string; amount?: number };
                        return (
                          <div key={i} className={flexGap2}>
                            <input className={inputCls + " px-2 py-1.5 text-xs"} placeholder="Description" value={dd.description ?? ""}
                              onChange={(e) => {
                                const arr = [...(payCfg.internal_deductions as Array<{ description: string; amount: number }>)];
                                arr[i] = { ...arr[i], description: e.target.value };
                                setPayCfg({ ...payCfg, internal_deductions: arr });
                              }} />
                            <input type="number" min={0} className={inputCls + " max-w-[110px] px-2 py-1.5 text-xs"} placeholder="Amount"
                              value={dd.amount ?? 0}
                              onChange={(e) => {
                                const arr = [...(payCfg.internal_deductions as Array<{ description: string; amount: number }>)];
                                arr[i] = { ...arr[i], amount: Number(e.target.value) };
                                setPayCfg({ ...payCfg, internal_deductions: arr });
                              }} />
                            <button type="button" className="rounded-lg p-1 text-rose-500 hover:bg-rose-50"
                              onClick={() => setPayCfg({ ...payCfg, internal_deductions: (payCfg.internal_deductions as Array<unknown>).filter((_, x) => x !== i) })}>✕</button>
                          </div>
                        );
                      })}
                      <button type="button" className="text-xs font-medium text-[var(--color-primary)]"
                        onClick={() => setPayCfg({ ...payCfg, internal_deductions: [...((payCfg.internal_deductions as Array<{ description: string; amount: number }>) ?? []), { description: "", amount: 0 }] })}>
                        + Add deduction
                      </button>
                    </div>
                    <button className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50" onClick={savePayrollCfg} disabled={saving}>
                      {saving ? <Loader2 className={spinner} /> : <Save className="h-4 w-4" />} Save payroll settings
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-[var(--color-border)] p-3 text-xs sm:grid-cols-3">
                    <div><span className="block text-[var(--color-muted-fg)]">Structure</span>Basic {Number(payCfg.basic_salary_pct) ?? 50}% · Housing {Number(payCfg.housing_pct) ?? 20}% · Transport {Number(payCfg.transport_pct) ?? 10}%</div>
                    <div><span className="block text-[var(--color-muted-fg)]">Pension</span>{Number(payCfg.pension_rate_pct) ?? 8}% of {Number(payCfg.pensionable_portion_pct) ?? 80}%</div>
                    <div><span className="block text-[var(--color-muted-fg)]">NHIS / NHF</span>{payCfg.nhis_applicable ? "On" : "Off"} / {payCfg.nhf_applicable === false ? "Off" : "On"}</div>
                    <div><span className="block text-[var(--color-muted-fg)]">Rent</span>{fmtN(Number(payCfg.annual_rent) ?? 0)}/yr</div>
                    <div><span className="block text-[var(--color-muted-fg)]">Pension PIN</span>{String(payCfg.pension_pin ?? "—")}</div>
                    <div><span className="block text-[var(--color-muted-fg)]">Tax ID</span>{String(payCfg.tax_id ?? "—")}</div>
                  </div>
                )}
              </>
            )}

            <h4 className="mb-2 mt-5 text-sm font-semibold uppercase text-[var(--color-muted-fg)]">Credentials</h4>
            <div className="space-y-2">
              {(detail.credentials as Array<Record<string, unknown>> | undefined)?.map((c) => (
                <div key={String(c.id)} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
                  <div>
                    <b>{String(c.certification)}</b> <span className={mutedFg}>· {String(c.license_number ?? "—")}</span>
                  </div>
                  <div className={flexGap2}>
                    <span className={mutedXs}>exp {fmtDate(c.expiry_date as string)}</span>
                    {c.verified ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">verified</span> : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">unverified</span>}
                  </div>
                </div>
              ))}
              {(detail.credentials as Array<unknown> | undefined)?.length === 0 && <p className={mutedSmPlain}>No credentials recorded.</p>}
            </div>

            <h4 className="mb-2 mt-5 text-sm font-semibold uppercase text-[var(--color-muted-fg)]">Payroll history</h4>
            <div className="space-y-2">
              {(detail.payroll as Array<Record<string, unknown>> | undefined)?.map((p) => (
                <div key={String(p.id)} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
                  <span>{String(p.pay_period)} · {String(p.worked_days)} worked · {String(p.absent_days)} absent · {Number(p.overtime_hours)}h OT</span>
                  <b>{fmtN(Number(p.net_salary))}</b>
                </div>
              ))}
              {(detail.payroll as Array<unknown> | undefined)?.length === 0 && <p className={mutedSmPlain}>No payroll yet.</p>}
            </div>

            <h4 className="mb-2 mt-5 text-sm font-semibold uppercase text-[var(--color-muted-fg)]">Leave balances</h4>
            <div className="space-y-2">
              {(detail.leave_balances as Array<Record<string, unknown>> | undefined)?.map((b) => {
                const key = String(b.id ?? `${b.leave_type}-${b.leave_year}`);
                const editKey = `${b.staff_id}-${b.leave_type}-${b.leave_year}`;
                const isEditing = editKey in leaveEdits;
                return (
                  <div key={key} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
                    <span>{String(b.leave_type)} {String(b.leave_year)}</span>
                    <div className="flex items-center gap-2">
                      {isAdmin && isEditing ? (
                        <>
                          <span className="text-xs text-[var(--color-muted-fg)]">{Number(b.used_days)}/</span>
                          <input type="number" min={0} className="w-16 rounded border border-[var(--color-border)] px-1.5 py-0.5 text-right text-sm focus:border-[var(--color-primary)] outline-none"
                            value={leaveEdits[editKey]}
                            onChange={(e) => setLeaveEdits({ ...leaveEdits, [editKey]: Number(e.target.value) })} />
                        </>
                      ) : (
                        <b>{Number(b.used_days)}/{Number(b.entitled_days)}</b>
                      )}
                      {isAdmin && !isEditing && (
                        <button type="button" className="rounded p-0.5 text-[var(--color-muted-fg)] hover:text-[var(--color-primary)]" title="Edit entitlement"
                          onClick={() => setLeaveEdits({ ...leaveEdits, [editKey]: Number(b.entitled_days) })}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {isAdmin && isEditing && (
                        <>
                          {savedLeave[editKey] ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 animate-[pop_0.3s_ease-out]">
                              <Check className="h-3.5 w-3.5" /> Saved
                            </span>
                          ) : (
                            <button type="button" className="rounded p-0.5 text-emerald-600 hover:bg-emerald-50" title="Save"
                              disabled={savingLeave}
                              onClick={async () => {
                                setSavingLeave(true);
                                try {
                                  const res = await fetch("/api/hr/leave-balances", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ staff_id: b.staff_id, leave_type: b.leave_type, leave_year: b.leave_year, entitled_days: leaveEdits[editKey] }),
                                  });
                                  const body = await res.json();
                                  if (!res.ok) throw new Error(body.error ?? "Failed to save");
                                  setSavedLeave({ ...savedLeave, [editKey]: true });
                                  await new Promise((r) => setTimeout(r, 1200));
                                  setSavedLeave(({ [editKey]: _, ...rest }) => rest);
                                  setLeaveEdits(({ [editKey]: __, ...rest }) => rest);
                                  openDetail(String(detail.id));
                                } catch (e) {
                                  setSaveMsg(e instanceof Error ? e.message : "Save failed");
                                } finally {
                                  setSavingLeave(false);
                                }
                              }}>
                              {savingLeave ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          <button type="button" className="rounded p-0.5 text-rose-500 hover:bg-rose-50" title="Cancel"
                            onClick={() => {
                              setSavedLeave(({ [editKey]: _, ...rest }) => rest);
                              setLeaveEdits(({ [editKey]: __, ...rest }) => rest);
                            }}>
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {(detail.leave_balances as Array<unknown> | undefined)?.length === 0 && <p className={mutedSmPlain}>No balances yet.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
