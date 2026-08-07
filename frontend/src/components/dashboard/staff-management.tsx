"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Download, FileUp, KeyRound, Mail, MoreHorizontal, Pencil, Phone, Plus, Power, ShieldCheck, Trash2, UserRoundPlus, Users } from "lucide-react";
import { ActionDropdown } from "@/components/ui/action-dropdown";
import CsvImportModal, { type ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
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
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<DutyStatus>("all");
  const [importOpen, setImportOpen] = useState(false);
  const [onDutyToday, setOnDutyToday] = useState<Set<string>>(new Set());
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
      params.set("pageSize", "100");
      const res = await fetch(`/api/admin/users?${params.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load staff");
      setUsers(body.data ?? []);

      const today = todayISO();
      const dutyRes = await fetch(`/api/duty-roster?from=${today}&to=${today}`, { cache: "no-store" });
      if (dutyRes.ok) {
        const dutyBody = await dutyRes.json();
        const ids = new Set<string>();
        for (const r of dutyBody.data ?? []) if (r?.staff_id) ids.add(r.staff_id);
        setOnDutyToday(ids);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load staff");
    } finally {
      setLoading(false);
    }
  }, [search]);

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

  async function changeRole(user: StaffUser, role: string) {
    if (user.id === meId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update role");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update role");
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
      if (onDutyToday.has(user.staff.id)) return "on_duty";
    }
    return "off_duty";
  };

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
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-foreground)]">
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
              {
                label: "Import Staff (CSV)",
                description: "Upload a CSV to add many staff at once",
                icon: <FileUp size={14} aria-hidden="true" />,
                onClick: () => setImportOpen(true),
              },
            ]}
          />
          <ActionDropdown
            label="Export"
            variant="outline"
            icon={<Download size={16} aria-hidden="true" />}
            items={[
              {
                label: "Staff (CSV)",
                description: "Download the staff list as a spreadsheet",
                icon: <Download size={14} aria-hidden="true" />,
                onClick: exportStaffCsv,
              },
              {
                label: "Staff (PDF)",
                description: "Open a printable PDF of the staff list",
                icon: <Download size={14} aria-hidden="true" />,
                onClick: exportStaffPdf,
              },
            ]}
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
          {visibleUsers.map((user) => (
            <div
              key={user.id}
              className={`group relative overflow-hidden rounded-2xl border bg-white shadow-[var(--shadow-sm)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] ${
                user.is_active ? "border-[var(--color-border)]" : "border-dashed opacity-70"
              }`}
            >
              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600" />
              <div className="flex items-start justify-between gap-3 p-4 pb-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradientFor(user.role)} text-sm font-bold text-white shadow-md ring-2 ring-white`}>
                    {initialsOf(user.full_name) || "ST"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--color-foreground)]">
                      {user.full_name}
                    </p>
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-primary-dark)]">
                      {ROLE_LABELS[user.role] ?? user.role}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {(() => {
                    const st = dutyStatusOf(user);
                    const cfg =
                      st === "on_duty"
                        ? { cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" }
                        : st === "on_leave"
                          ? { cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500" }
                          : { cls: "bg-slate-100 text-slate-500", dot: "bg-slate-400" };
                    const label = st === "on_duty" ? "On Duty" : st === "on_leave" ? "On Leave" : "Off Duty";
                    return (
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${cfg.cls}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                        {label}
                      </span>
                    );
                  })()}
                  {!user.is_active && (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">
                      Disabled
                    </span>
                  )}
                </div>
              </div>

              <div className="mx-4 space-y-1.5 rounded-xl bg-[var(--color-muted)] p-3 text-xs">
                {user.phone && (
                  <a
                    className="focus-ring flex min-w-0 items-center gap-2 font-semibold text-blue-600 transition-colors duration-200 hover:text-blue-700 hover:underline"
                    href={`tel:${user.phone}`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-[var(--color-primary-dark)] shadow-sm">
                      <Phone size={12} aria-hidden="true" />
                    </span>
                    <span className="truncate">{user.phone}</span>
                  </a>
                )}
                <a
                  className="focus-ring flex min-w-0 items-center gap-2 font-semibold text-blue-600 transition-colors duration-200 hover:text-blue-700 hover:underline"
                  href={`mailto:${user.email}`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-[var(--color-primary-dark)] shadow-sm">
                    <Mail size={12} aria-hidden="true" />
                  </span>
                  <span className="truncate">{user.email}</span>
                </a>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--color-border)] bg-[var(--color-muted)]/50 px-4 py-3">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
                  {user.staff?.staff_number && (
                    <span className="rounded-md bg-white px-2 py-1 font-mono text-[var(--color-muted-fg)] shadow-sm">
                      {user.staff.staff_number}
                    </span>
                  )}
                  {user.staff?.department && (
                    <span className="truncate rounded-md bg-white px-2 py-1 text-[var(--color-muted-fg)] shadow-sm">
                      {user.staff.department}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {user.id === meId && (
                    <span className="truncate text-xs text-[var(--color-muted-fg)]">(you)</span>
                  )}
                  {user.staff && (
                    <button
                      type="button"
                      onClick={() => router.push(`/app/roster?staff=${user.staff!.id}`)}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary-soft)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-primary-dark)] transition-colors duration-200 hover:bg-[var(--color-primary)] hover:text-white"
                    >
                      <CalendarRange size={13} aria-hidden="true" /> Schedule
                    </button>
                  )}
                  {(() => {
                    const canManage = user.role !== "super_admin" && user.id !== meId;
                    const canDelete =
                      (myRole === "super_admin" || myRole === "hospital_admin") &&
                      user.role !== "super_admin" &&
                      user.id !== meId;
                    if (!user.staff && !canManage && !canDelete) return null;
                    return (
                      <div className="relative" data-staff-menu>
                      <button
                        type="button"
                        onClick={() => setMenuOpenId(menuOpenId === user.id ? null : user.id)}
                        disabled={busy}
                        aria-label={`Actions for ${user.full_name}`}
                        aria-expanded={menuOpenId === user.id}
                        className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[var(--color-muted-fg)] shadow-sm transition-colors duration-200 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                      >
                        <MoreHorizontal size={16} aria-hidden="true" />
                      </button>
                      {menuOpenId === user.id && (
                        <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white py-1 shadow-[var(--shadow-lg)]">
                          {user.staff && (
                            <button
                              type="button"
                              onClick={() => {
                                setMenuOpenId(null);
                                setEditTarget(user);
                              }}
                              disabled={busy}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--color-foreground)] transition-colors duration-150 hover:bg-[var(--color-muted)]"
                            >
                              <Pencil size={13} aria-hidden="true" /> Edit Details
                            </button>
                          )}
                          {canManage && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuOpenId(null);
                                  resetPassword(user);
                                }}
                                disabled={busy}
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
                                disabled={busy}
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
                              disabled={busy}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-600 transition-colors duration-150 hover:bg-red-50"
                            >
                              <Trash2 size={13} aria-hidden="true" /> Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
                </div>
              </div>

              {user.role !== "super_admin" && user.id !== meId && (
                <label className="block px-4 pb-4 pt-3">
                  <span className="mb-1 flex items-center gap-1 text-xs font-medium text-[var(--color-muted-fg)]">
                    <ShieldCheck size={13} aria-hidden="true" /> Role
                  </span>
                  <select
                    value={user.role}
                    onChange={(e) => changeRole(user, e.target.value)}
                    disabled={busy}
                    className={inputCls}
                  >
                    {rolesFor(myRole).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          ))}
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
              <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold">
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
              <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold">
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

      <CsvImportModal
        open={importOpen}
        title="Import Staff"
        description="Add multiple staff members from a CSV file. The first row must be the header with the columns below, in this order. Leave password empty to generate a temporary one — it will be shown after import."
        columns={["first_name", "last_name", "email", "phone", "role", "department", "specialization", "password"]}
        sampleRows={[
          ["Ada", "Okafor", "ada.okafor@clinic.com", "0803 000 1111", "doctor", "Cardiology", "Consultant", ""],
        ]}
        templateFilename="staff-import-template.csv"
        onClose={() => setImportOpen(false)}
        onImport={importStaff}
        onImported={() => load()}
      />
    </div>
  );
}
