"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserRound, Users } from "lucide-react";
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
    is_available: boolean;
  } | null;
}

const CREATABLE_ROLES: StaffRole[] = [
  "hospital_admin",
  "doctor",
  "nurse",
  "pharmacist",
  "lab_tech",
  "cashier",
  "receptionist",
];

export default function StaffManagement({ meId }: { meId: string }) {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const inputCls =
    "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";

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
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]"
        >
          <Plus size={16} aria-hidden="true" /> Add Admin / Staff
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]"
        >
          {error}
        </p>
      )}

      <div className="relative max-w-md">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="focus-ring w-full rounded-lg border border-[var(--color-border)] bg-white py-2.5 pl-3 pr-3 text-sm outline-none transition-colors duration-200 placeholder:text-[var(--color-muted-fg)] focus:border-[var(--color-primary)]"
        />
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
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {users.map((user) => (
            <div
              key={user.id}
              className={`rounded-xl border bg-white p-4 shadow-[var(--shadow-sm)] ${
                user.is_active ? "border-[var(--color-border)]" : "border-dashed opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      user.role === "hospital_admin"
                        ? "sky-gradient text-white"
                        : "bg-[var(--color-muted)] text-[var(--color-muted-fg)]"
                    }`}
                  >
                    <UserRound size={18} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--color-foreground)]">
                      {user.full_name}
                    </p>
                    <p className="truncate text-xs text-[var(--color-muted-fg)]">{user.email}</p>
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    user.is_active
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-[var(--color-muted)] text-[var(--color-muted-fg)]"
                  }`}
                >
                  {user.is_active ? "Active" : "Disabled"}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 font-medium text-[var(--color-primary-dark)]">
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
                {user.staff?.staff_number && (
                  <span className="font-mono text-[var(--color-muted-fg)]">
                    {user.staff.staff_number}
                  </span>
                )}
                {user.staff?.department && (
                  <span className="text-[var(--color-muted-fg)]">{user.staff.department}</span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {user.role !== "super_admin" && user.id !== meId && (
                  <>
                    <button
                      type="button"
                      onClick={() => resetPassword(user)}
                      disabled={busy}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium transition-colors duration-200 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                    >
                      <KeyRound size={13} aria-hidden="true" /> Reset password
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(user)}
                      disabled={busy}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium transition-colors duration-200 hover:border-red-300 hover:text-red-600"
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      {user.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </>
                )}
                {user.id === meId && (
                  <span className="text-xs text-[var(--color-muted-fg)]">(you)</span>
                )}
              </div>

              {user.role !== "super_admin" && user.id !== meId && (
                <label className="mt-3 block">
                  <span className="mb-1 flex items-center gap-1 text-xs font-medium text-[var(--color-muted-fg)]">
                    <ShieldCheck size={13} aria-hidden="true" /> Role
                  </span>
                  <select
                    value={user.role}
                    onChange={(e) => changeRole(user, e.target.value)}
                    disabled={busy}
                    className={inputCls}
                  >
                    {CREATABLE_ROLES.map((r) => (
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
                    {CREATABLE_ROLES.map((r) => (
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
    </div>
  );
}
