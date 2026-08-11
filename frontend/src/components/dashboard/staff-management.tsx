"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CalendarOff, CalendarRange, Clock, KeyRound, Mail, MoreHorizontal, Pencil, Phone, Plus, Power, ShieldCheck, Stethoscope, Trash2, UserRoundCheck, UserRoundPlus, Users } from "lucide-react";
import { ActionDropdown } from "@/components/ui/action-dropdown";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { fmtDate, fmtTime } from "@/lib/shift-format";
import { ROLE_LABELS, type StaffRole } from "@/lib/auth";

interface StaffUser {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  staff?: {
    id: string;
    staff_number: string;
    department: string | null;
    specialization: string | null;
    license_number: string | null;
    qualification: string | null;
    employment_type: string | null;
    years_of_exp: number | null;
    base_salary: number | null;
    is_available: boolean;
    available_from: string | null;
    available_until: string | null;
    on_leave_until: string | null;
  } | null;
}

type DutyStatus = "all" | "on_duty" | "off_duty" | "on_leave";

const CREATABLE_ROLES: StaffRole[] = [
  "hospital_admin",
  "doctor",
  "nurse",
  "pharmacist",
  "lab_tech",
  "cashier",
  "receptionist",
  "medical_officer",
  "surgeon",
  "anesthesiologist",
  "radiologist",
  "radiographer",
  "physiotherapist",
  "dentist",
  "optometrist",
  "dietician",
  "medical_records",
  "accountant",
  "hr_officer",
  "it_support",
  "security",
  "ward_orderly",
  "hmo_officer",
  "paramedic",
];

function rolesFor(myRole?: string): StaffRole[] {
  return myRole === "super_admin"
    ? ["super_admin", ...CREATABLE_ROLES]
    : CREATABLE_ROLES;
}

const AVATAR_GRADIENTS = [
  "from-sky-500 to-blue-600",
  "from-violet-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-amber-400 to-orange-500",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-blue-600",
  "from-fuchsia-500 to-purple-600",
];

function gradientFor(role: string): string {
  if (role === "hospital_admin" || role === "super_admin") return "from-sky-500 to-blue-600";
  const key = [...role].reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[key % AVATAR_GRADIENTS.length];
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export default function StaffManagement({ meId, myRole }: { meId: string; myRole?: string }) {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [specFilter, setSpecFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<DutyStatus>("all");
  const [todayShifts, setTodayShifts] = useState<Record<string, { from_time: string; until_time: string }>>({});
  const [availTarget, setAvailTarget] = useState<StaffUser | null>(null);
  const [availForm, setAvailForm] = useState({ is_available: true, available_from: "09:00", available_until: "17:00" });
  const [leaveTarget, setLeaveTarget] = useState<StaffUser | null>(null);
  const [leaveForm, setLeaveForm] = useState({ on_leave_until: "" });
  const [roleTarget, setRoleTarget] = useState<StaffUser | null>(null);
  const [roleForm, setRoleForm] = useState("");
  const router = useRouter();

  const todayISO = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  useEffect(() => {
    if (!menuOpenId) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-staff-menu]")) setMenuOpenId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpenId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (roleFilter) params.set("role", roleFilter);
      if (deptFilter.trim()) params.set("department", deptFilter.trim());
      if (specFilter.trim()) params.set("specialization", specFilter.trim());
      params.set("pageSize", "100");
      const res = await fetch(`/api/admin/users?${params.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load staff");
      setUsers(body.data ?? []);

      const today = todayISO();
      const dutyRes = await fetch(`/api/duty-roster?from=${today}&to=${today}`, { cache: "no-store" });
      if (dutyRes.ok) {
        const dutyBody = await dutyRes.json();
        const shifts: Record<string, { from_time: string; until_time: string }> = {};
        for (const r of dutyBody.data ?? []) {
          if (r?.staff_id && r?.from_time) {
            shifts[r.staff_id] = { from_time: r.from_time, until_time: r.until_time ?? "" };
          }
        }
        setTodayShifts(shifts);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load staff");
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, deptFilter, specFilter]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function handleCreate(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.get("fullName"),
          email: form.get("email"),
          phone: form.get("phone") || undefined,
          password: form.get("password"),
          role: form.get("role"),
          department: form.get("department") || undefined,
          specialization: form.get("specialization") || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create user");
      setShowCreate(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(user: StaffUser) {
    if (user.id === meId) return;
    if (!confirm(`${user.is_active ? "Deactivate" : "Activate"} ${user.full_name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update user");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update user");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(user: StaffUser) {
    const password = prompt(`New password for ${user.full_name} (min 8 characters):`);
    if (!password) return;
    if (password.length < 8) {
      alert("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to reset password");
      alert("Password updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset password");
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(user: StaffUser) {
    const name = user.full_name || user.email;
    if (!confirm(`Permanently delete ${name}?\n\nThis removes their login, staff profile, schedules, leave, notifications, mail and chats. It cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete user");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete user");
    } finally {
      setBusy(false);
    }
  }

  async function saveStaffDetails(form: FormData) {
    if (!editTarget?.staff) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/${editTarget.staff.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department: form.get("department") || null,
          specialization: form.get("specialization") || null,
          license_number: form.get("license_number") || null,
          qualification: form.get("qualification") || null,
          employment_type: form.get("employment_type") || null,
          years_of_exp: form.get("years_of_exp") ? Number(form.get("years_of_exp")) : null,
          base_salary: form.get("base_salary") ? Number(form.get("base_salary")) : null,
          is_available: form.get("is_available") === "on",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save staff details");
      setEditTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save staff details");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";

  const dutyStatusOf = (user: StaffUser): Exclude<DutyStatus, "all"> => {
    if (user.staff) {
      if (user.staff.on_leave_until && todayISO() <= user.staff.on_leave_until) return "on_leave";
      if (todayShifts[user.staff.id]) return "on_duty";
    }
    return "off_duty";
  };

  function openAvailability(user: StaffUser) {
    setAvailTarget(user);
    setAvailForm({
      is_available: user.staff?.is_available ?? true,
      available_from: user.staff?.available_from?.slice(0, 5) || "09:00",
      available_until: user.staff?.available_until?.slice(0, 5) || "17:00",
    });
  }

  function openLeave(user: StaffUser) {
    setLeaveTarget(user);
    setLeaveForm({ on_leave_until: user.staff?.on_leave_until ?? "" });
  }

  async function saveAvailability() {
    if (!availTarget?.staff) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/${availTarget.staff.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_available: availForm.is_available,
          available_from: availForm.is_available ? availForm.available_from : null,
          available_until: availForm.is_available ? availForm.available_until : null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update availability");
      setAvailTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update availability");
    } finally {
      setBusy(false);
    }
  }

  async function saveLeave() {
    if (!leaveTarget?.staff) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/${leaveTarget.staff.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on_leave_until: leaveForm.on_leave_until || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update leave");
      setLeaveTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update leave");
    } finally {
      setBusy(false);
    }
  }

  async function saveRole() {
    if (!roleTarget) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${roleTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: roleForm }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update role");
      setRoleTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setBusy(false);
    }
  }

  const visibleUsers = users.filter(
    (u) => statusFilter === "all" || dutyStatusOf(u) === statusFilter
  );

  const STAFF_EXPORT_COLUMNS = [
    "full_name",
    "email",
    "phone",
    "role",
    "department",
    "specialization",
    "staff_number",
    "account_status",
  ];

  function staffRows() {
    return users.map((u) => [
      u.full_name,
      u.email,
      u.phone ?? "",
      ROLE_LABELS[u.role] ?? u.role,
      u.staff?.department ?? "",
      u.staff?.specialization ?? "",
      u.staff?.staff_number ?? "",
      u.is_active ? "Active" : "Disabled",
    ]);
  }

  function exportStaffCsv() {
    if (users.length === 0) {
      alert("Nothing to export — there are no staff yet.");
      return;
    }
    downloadCsv(`staff-${dateStamp()}.csv`, STAFF_EXPORT_COLUMNS, staffRows());
  }

  function exportStaffPdf() {
    if (users.length === 0) {
      alert("Nothing to export — there are no staff yet.");
      return;
    }
    printTable("Staff List", STAFF_EXPORT_COLUMNS, staffRows());
  }

  async function importStaff(rows: string[][]): Promise<ImportResult> {
    const errors: string[] = [];
    const notes: string[] = [];
    let created = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNo = i + 2;
      const fullName = `${r[0]?.trim() ?? ""} ${r[1]?.trim() ?? ""}`.trim();
      const email = r[2]?.trim() ?? "";
      if (!fullName || !email) {
        errors.push(`Row ${rowNo}: first_name, last_name and email are required`);
        continue;
      }
      let password = r[7]?.trim() ?? "";
      let generated = false;
      if (password.length < 8) {
        password = `SkyCare@${Math.random().toString(36).slice(2, 8)}`;
        generated = true;
      }
      try {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName,
            email,
            phone: r[3]?.trim() || undefined,
            role: (r[4]?.trim() as StaffRole) || "nurse",
            department: r[5]?.trim() || undefined,
            specialization: r[6]?.trim() || undefined,
            password,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to create user");
        created++;
        notes.push(`${email}${generated ? ` — temp password: ${password}` : ""}`);
      } catch (e) {
        errors.push(
          `Row ${rowNo} (${email}): ${e instanceof Error ? e.message : "Failed to create user"}`
        );
      }
    }
    return { created, failed: errors.length, errors, notes };
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
            Staff & Admins
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
            Manage your hospital&apos;s team — admins, doctors, nurses, pharmacists and more.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ActionDropdown
            label="New"
            icon={<Plus size={16} aria-hidden="true" />}
            items={[
              {
                label: "Staff",
                description: "Add an admin or staff member",
                icon: <UserRoundPlus size={14} aria-hidden="true" />,
                onClick: () => setShowCreate(true),
              },
            ]}
          />
          <ImportExportMenu
            entityLabel="Staff"
            exportCsv={exportStaffCsv}
            exportPdf={exportStaffPdf}
            importColumns={["first_name", "last_name", "email", "phone", "role", "department", "specialization", "password"]}
            importSample={[
              ["Ada", "Okafor", "ada.okafor@clinic.com", "0803 000 1111", "doctor", "Cardiology", "Consultant", ""],
            ]}
            templateFilename="staff-import-template.csv"
            onImport={importStaff}
            onImported={() => load()}
          />
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-md flex-1 basis-56">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="focus-ring w-full rounded-lg border border-[var(--color-border)] bg-white py-2.5 pl-3 pr-3 text-sm outline-none transition-colors duration-200 placeholder:text-[var(--color-muted-fg)] focus:border-[var(--color-primary)]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DutyStatus)}
          aria-label="Filter by duty status"
          className={inputCls + " w-auto"}
        >
          <option value="all">All statuses</option>
          <option value="on_duty">On Duty</option>
          <option value="off_duty">Off Duty</option>
          <option value="on_leave">On Leave</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Filter by role"
          className={inputCls + " w-auto"}
        >
          <option value="">All roles</option>
          {rolesFor(myRole).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <div className="relative max-w-xs flex-1 basis-48">
          <input
            type="text"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            placeholder="Filter by department…"
            aria-label="Filter by department"
            className="focus-ring w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 placeholder:text-[var(--color-muted-fg)] focus:border-[var(--color-primary)]"
          />
        </div>
        <div className="relative max-w-xs flex-1 basis-48">
          <input
            type="text"
            value={specFilter}
            onChange={(e) => setSpecFilter(e.target.value)}
            placeholder="Filter by specialization…"
            aria-label="Filter by specialization"
            className="focus-ring w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 placeholder:text-[var(--color-muted-fg)] focus:border-[var(--color-primary)]"
          />
        </div>
        {((roleFilter) || deptFilter.trim() || specFilter.trim()) && (
          <button
            type="button"
            onClick={() => {
              setRoleFilter("");
              setDeptFilter("");
              setSpecFilter("");
            }}
            className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm font-medium text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-slate-50 hover:text-[var(--color-foreground)]"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading staff…</p>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <Users size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">
            No staff yet. Add your first admin or staff member.
          </p>
        </div>
      ) : visibleUsers.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <p className="text-sm font-medium text-[var(--color-foreground)]">
            No staff match the current filters.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleUsers.map((user) => {
            const canManage = user.role !== "super_admin" && user.id !== meId;
            const canDelete =
              (myRole === "super_admin" || myRole === "hospital_admin") &&
              user.role !== "super_admin" &&
              user.id !== meId;
            return (
            <div
              key={user.id}
              className={`group relative overflow-hidden rounded-2xl border bg-white shadow-[var(--shadow-sm)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] ${
                user.is_active ? "border-[var(--color-border)]" : "border-dashed opacity-70"
              }`}
            >
              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600" />
              <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradientFor(user.role)} text-sm font-bold text-white shadow-md ring-2 ring-white`}>
                    {initialsOf(user.full_name) || "ST"}
                  </span>
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-[var(--color-foreground)]">
                      <span className="truncate">{user.full_name}</span>
                      {user.id === meId && (
                        <span className="shrink-0 text-xs font-normal text-[var(--color-muted-fg)]">(you)</span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[var(--color-muted-fg)]">
                      {ROLE_LABELS[user.role] ?? user.role}
                    </p>
                  </div>
                </div>
                <div className="relative shrink-0" data-staff-menu>
                  <button
                    type="button"
                    onClick={() => setMenuOpenId(menuOpenId === user.id ? null : user.id)}
                    disabled={busy}
                    aria-label={`Actions for ${user.full_name}`}
                    aria-expanded={menuOpenId === user.id}
                    className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                  >
                    <MoreHorizontal size={16} aria-hidden="true" />
                  </button>
                  {menuOpenId === user.id && (
                    <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white py-1 shadow-[var(--shadow-lg)]">
                      {user.staff && (
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpenId(null);
                            router.push(`/app/roster?staff=${user.staff!.id}`);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--color-foreground)] transition-colors duration-150 hover:bg-[var(--color-muted)]"
                        >
                          <CalendarRange size={13} aria-hidden="true" /> Schedule Duty
                        </button>
                      )}
                      {user.staff && (
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpenId(null);
                            openAvailability(user);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--color-foreground)] transition-colors duration-150 hover:bg-[var(--color-muted)]"
                        >
                          <Clock size={13} aria-hidden="true" /> Availability
                        </button>
                      )}
                      {user.staff &&
                        (dutyStatusOf(user) === "on_leave" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpenId(null);
                              openLeave(user);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--color-foreground)] transition-colors duration-150 hover:bg-[var(--color-muted)]"
                          >
                            <UserRoundCheck size={13} aria-hidden="true" /> Return to Duty
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpenId(null);
                              openLeave(user);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--color-foreground)] transition-colors duration-150 hover:bg-[var(--color-muted)]"
                          >
                            <CalendarOff size={13} aria-hidden="true" /> Mark On Leave
                          </button>
                        ))}
                      {user.staff && (
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpenId(null);
                            setEditTarget(user);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--color-foreground)] transition-colors duration-150 hover:bg-[var(--color-muted)]"
                        >
                          <Pencil size={13} aria-hidden="true" /> Edit
                        </button>
                      )}
                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpenId(null);
                              setRoleTarget(user);
                              setRoleForm(user.role);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--color-foreground)] transition-colors duration-150 hover:bg-[var(--color-muted)]"
                          >
                            <ShieldCheck size={13} aria-hidden="true" /> Change Role
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpenId(null);
                              resetPassword(user);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--color-foreground)] transition-colors duration-150 hover:bg-[var(--color-muted)]"
                          >
                            <KeyRound size={13} aria-hidden="true" /> Reset Password
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpenId(null);
                              toggleActive(user);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--color-foreground)] transition-colors duration-150 hover:bg-[var(--color-muted)]"
                          >
                            <Power size={13} aria-hidden="true" />
                            {user.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpenId(null);
                            deleteUser(user);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-600 transition-colors duration-150 hover:bg-red-50"
                        >
                          <Trash2 size={13} aria-hidden="true" /> Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 px-5 text-xs text-[var(--color-muted-fg)]">
                {user.staff?.department && (
                  <div className="flex items-center gap-2">
                    <Stethoscope size={13} aria-hidden="true" className="shrink-0 text-[var(--color-primary-dark)]" />
                    <span className="truncate font-medium text-[var(--color-foreground)]">
                      {user.staff.department}
                      {user.staff.specialization ? ` — ${user.staff.specialization}` : ""}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Clock size={13} aria-hidden="true" className="shrink-0 text-[var(--color-primary-dark)]" />
                  {dutyStatusOf(user) === "on_leave" ? (
                    <span className="font-medium text-amber-600">
                      On leave until {user.staff?.on_leave_until ? fmtDate(user.staff.on_leave_until) : ""}
                    </span>
                  ) : user.staff && todayShifts[user.staff.id] ? (
                    <span className="font-semibold text-emerald-700">
                      Duty: FROM {fmtTime(todayShifts[user.staff.id].from_time)} UNTIL {fmtTime(todayShifts[user.staff.id].until_time)}
                    </span>
                  ) : user.staff?.is_available ? (
                    <span className="font-medium text-[var(--color-foreground)]">
                      Available: {user.staff.available_from ? fmtTime(user.staff.available_from) : "09:00 AM"}&nbsp;–&nbsp;
                      {user.staff.available_until ? fmtTime(user.staff.available_until) : "05:00 PM"}
                    </span>
                  ) : (
                    <span className="font-medium text-[var(--color-muted-fg)]">Not available today</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={13} aria-hidden="true" className="shrink-0 text-[var(--color-primary-dark)]" />
                  {user.phone ? (
                    <a className="focus-ring font-semibold text-blue-600 hover:text-blue-700 hover:underline" href={`tel:${user.phone}`}>
                      {user.phone}
                    </a>
                  ) : (
                    <span>—</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={13} aria-hidden="true" className="shrink-0 text-[var(--color-primary-dark)]" />
                  <a className="focus-ring min-w-0 truncate font-semibold text-blue-600 hover:text-blue-700 hover:underline" href={`mailto:${user.email}`}>
                    {user.email}
                  </a>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 px-5 pb-5 pt-1">
                {(() => {
                  const st = dutyStatusOf(user);
                  const cfg =
                    st === "on_duty"
                      ? { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" }
                      : st === "on_leave"
                        ? { cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" }
                        : { cls: "bg-slate-100 text-slate-500 border-slate-200", dot: "bg-slate-400" };
                  return (
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${cfg.cls}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                      {st === "on_duty" ? "On Duty" : st === "on_leave" ? "On Leave" : "Off Duty"}
                    </span>
                  );
                })()}
                <div className="flex shrink-0 items-center gap-2">
                  {!user.is_active && (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">Disabled</span>
                  )}
                  {user.staff && (
                    <button
                      type="button"
                      onClick={() => router.push(`/app/roster?staff=${user.staff!.id}`)}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--color-primary-dark)] transition-colors duration-200 hover:bg-[var(--color-primary)] hover:text-white"
                    >
                      <CalendarDays size={13} aria-hidden="true" /> Schedule Duty
                    </button>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Create user modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Add admin or staff"
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                Add Admin / Staff
              </h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                handleCreate(new FormData(e.currentTarget));
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium" htmlFor="s-fullName">
                    Full name
                  </label>
                  <input id="s-fullName" name="fullName" required className={inputCls} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="s-email">
                    Email
                  </label>
                  <input id="s-email" name="email" type="email" required className={inputCls} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="s-phone">
                    Phone
                  </label>
                  <input id="s-phone" name="phone" className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium" htmlFor="s-role">
                    Role
                  </label>
                  <select id="s-role" name="role" className={inputCls} defaultValue="nurse">
                    {rolesFor(myRole).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="s-dept">
                    Department
                  </label>
                  <input id="s-dept" name="department" className={inputCls} placeholder="e.g. Cardiology" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="s-spec">
                    Specialization
                  </label>
                  <input id="s-spec" name="specialization" className={inputCls} placeholder="e.g. Consultant" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium" htmlFor="s-password">
                    Login password
                  </label>
                  <input
                    id="s-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    placeholder="8+ characters"
                    className={inputCls}
                  />
                  <p className="mt-1 text-xs text-[var(--color-muted-fg)]">
                    The staff member signs in with this email + password at /login.
                  </p>
                </div>
              </div>
              {error && (
                <p
                  role="alert"
                  className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]"
                >
                  {error}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
                >
                  {busy ? "Creating…" : "Create account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit staff details modal */}
      {editTarget?.staff && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Edit staff details"
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                Edit details — {editTarget.full_name}
              </h2>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                saveStaffDetails(new FormData(e.currentTarget));
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="sd-dept">
                    Department
                  </label>
                  <input
                    id="sd-dept"
                    name="department"
                    className={inputCls}
                    defaultValue={editTarget.staff.department ?? ""}
                    placeholder="e.g. Cardiology"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="sd-spec">
                    Specialization
                  </label>
                  <input
                    id="sd-spec"
                    name="specialization"
                    className={inputCls}
                    defaultValue={editTarget.staff.specialization ?? ""}
                    placeholder="e.g. Consultant"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="sd-lic">
                    License number
                  </label>
                  <input
                    id="sd-lic"
                    name="license_number"
                    className={inputCls}
                    defaultValue={editTarget.staff.license_number ?? ""}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="sd-qual">
                    Qualification
                  </label>
                  <input
                    id="sd-qual"
                    name="qualification"
                    className={inputCls}
                    defaultValue={editTarget.staff.qualification ?? ""}
                    placeholder="e.g. MBBS, MD"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="sd-emp">
                    Employment type
                  </label>
                  <select
                    id="sd-emp"
                    name="employment_type"
                    className={inputCls}
                    defaultValue={editTarget.staff.employment_type ?? "full_time"}
                  >
                    <option value="full_time">Full time</option>
                    <option value="part_time">Part time</option>
                    <option value="contract">Contract</option>
                    <option value="locum">Locum</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="sd-years">
                    Years of experience
                  </label>
                  <input
                    id="sd-years"
                    name="years_of_exp"
                    type="number"
                    min={0}
                    className={inputCls}
                    defaultValue={editTarget.staff.years_of_exp ?? ""}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium" htmlFor="sd-salary">
                    Base salary (₦)
                  </label>
                  <input
                    id="sd-salary"
                    name="base_salary"
                    type="number"
                    min={0}
                    step="0.01"
                    className={inputCls}
                    defaultValue={editTarget.staff.base_salary ?? ""}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    name="is_available"
                    defaultChecked={editTarget.staff.is_available}
                    className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                  />
                  Available for duty / appointments
                </label>
              </div>
              {error && (
                <p
                  role="alert"
                  className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]"
                >
                  {error}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Save details"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Availability modal */}
      {availTarget?.staff && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={`Availability for ${availTarget.full_name}`}
        >
          <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                Availability — {availTarget.full_name}
              </h2>
              <button
                type="button"
                onClick={() => setAvailTarget(null)}
                className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={availForm.is_available}
                  onChange={(e) => setAvailForm((f) => ({ ...f, is_available: e.target.checked }))}
                  className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                />
                Available for duty / appointments
              </label>
              {availForm.is_available && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium" htmlFor="av-from">
                      From
                    </label>
                    <input
                      id="av-from"
                      type="time"
                      value={availForm.available_from}
                      onChange={(e) => setAvailForm((f) => ({ ...f, available_from: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium" htmlFor="av-until">
                      Until
                    </label>
                    <input
                      id="av-until"
                      type="time"
                      value={availForm.available_until}
                      onChange={(e) => setAvailForm((f) => ({ ...f, available_until: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                </div>
              )}
              {error && (
                <p
                  role="alert"
                  className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]"
                >
                  {error}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setAvailTarget(null)}
                  className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveAvailability}
                  disabled={busy}
                  className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leave modal */}
      {leaveTarget?.staff && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={`Leave for ${leaveTarget.full_name}`}
        >
          <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {dutyStatusOf(leaveTarget) === "on_leave"
                  ? `Return to duty — ${leaveTarget.full_name}`
                  : `Mark on leave — ${leaveTarget.full_name}`}
              </h2>
              <button
                type="button"
                onClick={() => setLeaveTarget(null)}
                className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="mt-5 space-y-4">
              {dutyStatusOf(leaveTarget) === "on_leave" ? (
                <p className="text-sm text-[var(--color-muted-fg)]">
                  {leaveTarget.full_name} is currently on leave until{" "}
                  {leaveTarget.staff.on_leave_until ? fmtDate(leaveTarget.staff.on_leave_until) : ""}. Clear the date
                  below to return them to duty.
                </p>
              ) : (
                <p className="text-sm text-[var(--color-muted-fg)]">
                  They will show as &quot;On Leave&quot; and not appear as available until this date.
                </p>
              )}
              <label className="mb-1 block text-sm font-medium" htmlFor="lv-date">
                Leave until
              </label>
              <input
                id="lv-date"
                type="date"
                value={leaveForm.on_leave_until}
                onChange={(e) => setLeaveForm((f) => ({ ...f, on_leave_until: e.target.value }))}
                className={inputCls}
              />
              {dutyStatusOf(leaveTarget) === "on_leave" && (
                <button
                  type="button"
                  onClick={() => setLeaveForm((f) => ({ ...f, on_leave_until: "" }))}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  Clear date — return to duty
                </button>
              )}
              {error && (
                <p
                  role="alert"
                  className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]"
                >
                  {error}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setLeaveTarget(null)}
                  className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveLeave}
                  disabled={busy}
                  className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change role modal */}
      {roleTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={`Change role for ${roleTarget.full_name}`}
        >
          <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                Change role — {roleTarget.full_name}
              </h2>
              <button
                type="button"
                onClick={() => setRoleTarget(null)}
                className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <label className="mb-1 block text-sm font-medium" htmlFor="cr-role">
                New role
              </label>
              <select
                id="cr-role"
                value={roleForm}
                onChange={(e) => setRoleForm(e.target.value)}
                className={inputCls}
              >
                {rolesFor(myRole).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[var(--color-muted-fg)]">
                This controls what {roleTarget.full_name.split(" ")[0] ?? "they"} can see and do in the dashboard.
              </p>
              {error && (
                <p
                  role="alert"
                  className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]"
                >
                  {error}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setRoleTarget(null)}
                  className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveRole}
                  disabled={busy}
                  className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
