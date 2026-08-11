"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Loader2, Lock, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { ROLE_LABELS, STAFF_ROLES, type StaffRole } from "@/lib/auth";
import { NAV_ITEMS, type AccessLevel, type ModuleAccess } from "@/lib/nav";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  module_access: ModuleAccess;
  created_at: string;
  staff: { department: string | null; specialization: string | null } | null;
}

/** Roles a hospital admin may assign (mirrors GRANTABLE_ROLES in the API). */
const ASSIGNABLE_ROLES = STAFF_ROLES.filter((r) => r !== "super_admin") as readonly StaffRole[];

const LEVEL_OPTIONS: { value: AccessLevel; label: string }[] = [
  { value: "full", label: "Full access" },
  { value: "view_only", label: "View only" },
  { value: "none", label: "None" },
];

/** Top-level modules shown in the access editor (personal/system pages excluded). */
const EDITOR_MODULES = NAV_ITEMS.filter((i) => !["account", "download", "profile", "settings"].includes(i.key));

const EDITOR_KEYS = EDITOR_MODULES.flatMap((m) => [m.key, ...(m.children?.map((c) => c.key) ?? [])]);

/**
 * Initial draft for the access editor. With an existing record, missing keys
 * mean "none" (as stored). With role default (null), everything starts at
 * "full" so Custom mode is a sensible downgrade base.
 */
function seedDraft(access: ModuleAccess): Record<string, AccessLevel> {
  const out: Record<string, AccessLevel> = {};
  for (const k of EDITOR_KEYS) out[k] = access ? (access[k] ?? "none") : "full";
  return out;
}

const inputCls =
  "h-10 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-foreground)] outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]";

function levelSelectCls() {
  return "h-8 rounded-lg border border-[var(--color-border)] bg-white px-2 text-xs text-[var(--color-foreground)] outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
}

export default function UsersRolesSection() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users?pageSize=200", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load users");
      setUsers(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = useCallback(
    async (id: string, payload: Record<string, unknown>, rollback?: () => void) => {
      setBusyId(id);
      setError(null);
      try {
        const res = await fetch(`/api/admin/users/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to save");
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
        rollback?.();
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  const toggleRole = (u: UserRow, role: string) => {
    if (role === u.role) return;
    patch(u.id, { role }, () => {});
  };

  const toggleActive = (u: UserRow) => {
    patch(u.id, { is_active: !u.is_active }, () => {});
  };

  const saveAccess = (u: UserRow, access: ModuleAccess) => {
    patch(u.id, { module_access: access }, () => {});
    setExpandedId(null);
  };

  const remove = async (u: UserRow) => {
    if (!window.confirm(`Permanently delete ${u.email}? This removes their login and profile.`)) return;
    setBusyId(u.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-foreground)]">Users & Roles</h2>
          <p className="mt-0.5 text-sm text-[var(--color-muted-fg)]">
            Assign each staff member a role and decide which modules they can access. Unchecked users keep their role&apos;s default modules.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]"
        >
          <Plus size={16} aria-hidden="true" /> Add User
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading users…</p>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <ShieldCheck size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">No users found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-slate-50 text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Module Access</th>
                  <th className="px-4 py-3 font-semibold">Active</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <UserRowView
                    key={u.id}
                    u={u}
                    busy={busyId === u.id}
                    expanded={expandedId === u.id}
                    onToggleExpand={() => setExpandedId(expandedId === u.id ? null : u.id)}
                    onRoleChange={(role) => toggleRole(u, role)}
                    onActiveChange={() => toggleActive(u)}
                    onSaveAccess={(access) => saveAccess(u, access)}
                    onDelete={() => remove(u)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
    </section>
  );
}

function UserRowView({
  u,
  busy,
  expanded,
  onToggleExpand,
  onRoleChange,
  onActiveChange,
  onSaveAccess,
  onDelete,
}: {
  u: UserRow;
  busy: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onRoleChange: (role: string) => void;
  onActiveChange: () => void;
  onSaveAccess: (access: ModuleAccess) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, AccessLevel>>(() => seedDraft(u.module_access));
  const [custom, setCustom] = useState(u.module_access !== null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(seedDraft(u.module_access));
    setCustom(u.module_access !== null);
  }, [u.module_access]);

  const enterCustom = () => {
    setDraft(seedDraft(u.module_access));
    setCustom(true);
  };

  const grantedCount = u.module_access
    ? Object.values(u.module_access).filter((l) => l !== "none").length
    : null;

  const save = async () => {
    setSaving(true);
    onSaveAccess(custom ? draft : null);
    setSaving(false);
  };

  return (
    <>
      <tr className="border-b border-[var(--color-border)] last:border-b-0">
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-xs font-bold text-[var(--color-primary-dark)]">
              {(u.full_name || u.email).slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-[var(--color-foreground)]">{u.full_name || "—"}</p>
              <p className="truncate text-xs text-[var(--color-muted-fg)]">{u.email}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <select
            value={u.role}
            onChange={(e) => onRoleChange(e.target.value)}
            disabled={u.role === "super_admin" || busy}
            className="h-9 w-full max-w-[180px] rounded-lg border border-[var(--color-border)] bg-white px-2 text-sm text-[var(--color-foreground)] outline-none transition-colors duration-200 focus:border-[var(--color-primary)] disabled:opacity-60"
            aria-label={`Role for ${u.email}`}
          >
            <option value={u.role}>{ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}</option>
            {u.role === "super_admin" ? null : (
              ASSIGNABLE_ROLES.filter((r) => r !== u.role).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
              ))
            )}
          </select>
        </td>
        <td className="px-4 py-3">
          {u.role === "super_admin" ? (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--color-muted-fg)]">
              <Lock size={12} aria-hidden="true" /> Platform-wide
            </span>
          ) : grantedCount === null ? (
            <span className="text-xs text-[var(--color-muted-fg)]">Role default (all)</span>
          ) : grantedCount === 0 ? (
            <span className="text-xs text-[var(--color-muted-fg)]">No modules</span>
          ) : (
            <span className="text-xs font-medium text-[var(--color-primary-dark)]">{grantedCount} module(s)</span>
          )}
        </td>
        <td className="px-4 py-3">
          <button
            type="button"
            role="switch"
            aria-checked={u.is_active}
            aria-label={`Active for ${u.email}`}
            onClick={onActiveChange}
            disabled={u.role === "super_admin" || busy}
            className={`focus-ring relative h-6 w-11 rounded-full transition-colors duration-200 disabled:opacity-60 ${
              u.is_active ? "bg-emerald-500" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                u.is_active ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            {u.role !== "super_admin" && (
              <button
                type="button"
                onClick={onToggleExpand}
                disabled={busy}
                className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-foreground)] transition-colors duration-200 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-60"
              >
                <ShieldCheck size={13} aria-hidden="true" /> Access
                <ChevronDown size={12} aria-hidden="true" className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
              </button>
            )}
            <button
              type="button"
              onClick={onDelete}
              disabled={u.role === "super_admin" || busy}
              className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-destructive)] transition-colors duration-200 hover:border-[var(--color-destructive)] disabled:opacity-60"
              aria-label={`Delete ${u.email}`}
            >
              {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Trash2 size={13} aria-hidden="true" />}
            </button>
          </div>
        </td>
      </tr>
      {expanded && u.role !== "super_admin" && (
        <tr className="bg-slate-50/60">
          <td colSpan={5} className="px-4 py-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--color-foreground)]">Module access for {u.full_name || u.email}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCustom(false)}
                    className={`focus-ring rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
                      !custom
                        ? "bg-[var(--color-primary)] text-white"
                        : "bg-white text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
                    }`}
                  >
                    Role default (all)
                  </button>
                  <button
                    type="button"
                    onClick={enterCustom}
                    className={`focus-ring rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
                      custom
                        ? "bg-[var(--color-primary)] text-white"
                        : "bg-white text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
                    }`}
                  >
                    Custom
                  </button>
                </div>
              </div>
              {custom && (
                <div className="space-y-2">
                  <p className="text-xs text-[var(--color-muted-fg)]">
                    Submenus are configured individually — but setting a module to <span className="font-semibold">Full access</span> grants all its submenus, and <span className="font-semibold">None</span> hides them all. <span className="font-semibold">View only</span> leaves submenus as they are.
                  </p>
                  <div className="space-y-1.5">
                    {EDITOR_MODULES.map((mod) => {
                      const children = mod.children ?? [];
                      return (
                        <div key={mod.key} className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-white">
                          <div className="flex items-center gap-3 px-3 py-2">
                            <mod.icon size={15} className="shrink-0 text-[var(--color-muted-fg)]" aria-hidden="true" />
                            <span className="flex-1 text-sm font-medium text-[var(--color-foreground)]">{mod.label}</span>
                            <select
                              value={draft[mod.key] ?? "none"}
                              onChange={(e) => {
                                const level = e.target.value as AccessLevel;
                                setDraft((d) => {
                                  const next = { ...d, [mod.key]: level };
                                  // Full access grants all submenus; None hides them all.
                                  // View only leaves children untouched — they stay individually configured.
                                  if (level === "full" || level === "none") {
                                    for (const c of children) next[c.key] = level;
                                  }
                                  return next;
                                });
                              }}
                              className={levelSelectCls()}
                              aria-label={`${mod.label} access level`}
                            >
                              {LEVEL_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </div>
                          {children.length > 0 && (
                            <div className="space-y-1 border-t border-[var(--color-border)] bg-slate-50/60 px-3 py-2 pl-9">
                              {children.map((c) => (
                                <div key={c.key} className="flex items-center gap-3 py-1">
                                  <span className="flex-1 text-xs text-[var(--color-muted-fg)]">{c.label}</span>
                                  <select
                                    value={draft[c.key] ?? "none"}
                                    onChange={(e) =>
                                      setDraft((d) => ({ ...d, [c.key]: e.target.value as AccessLevel }))
                                    }
                                    className={levelSelectCls()}
                                    aria-label={`${c.label} access level`}
                                  >
                                    {LEVEL_OPTIONS.map((o) => (
                                      <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                  </select>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onToggleExpand}
                  className="focus-ring rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-foreground)] transition-colors duration-200 hover:bg-[var(--color-muted)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
                  Save Access
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("receptionist");
  const [department, setDepartment] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!fullName.trim() || !email.trim() || !password) {
      setError("Name, email and password are required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          password,
          role,
          department: department.trim() || null,
          specialization: specialization.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create user");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Add user">
      <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-md rounded-xl bg-white p-5 shadow-[var(--shadow-xl)]">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-[var(--color-foreground)]">Add User</h3>
          <button type="button" onClick={onClose} className="focus-ring -mr-1 rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1 text-xs text-[var(--color-muted-fg)]">
          Creates a login for this staff member. You can fine-tune module access afterwards.
        </p>

        <div className="mt-4 space-y-3">
          {error && (
            <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
              {error}
            </p>
          )}
          <div>
            <label className={labelCls} htmlFor="au-name">Full name</label>
            <input id="au-name" className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="au-email">Email</label>
            <input id="au-email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="au-password">Temporary password</label>
            <input id="au-password" type="text" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" />
          </div>
          <div>
            <label className={labelCls} htmlFor="au-role">Role</label>
            <select id="au-role" className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="au-dept">Department</label>
            <input id="au-dept" className={inputCls} value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="au-spec">Specialization</label>
            <input id="au-spec" className={inputCls} value={specialization} onChange={(e) => setSpecialization(e.target.value)} />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="focus-ring rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-foreground)] transition-colors duration-200 hover:bg-[var(--color-muted)]">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
          >
            {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            Create Account
          </button>
        </div>
      </div>
    </div>
  );
}
