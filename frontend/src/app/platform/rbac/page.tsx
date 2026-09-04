"use client";

import { useEffect, useState } from "react";
import {
  RefreshCw, Shield, Plus, Trash2, Save, X, Loader2, Check,
} from "lucide-react";
import PlatformModal from "@/components/platform/platform-modal";
import { PlatformGlassCard, PlatformPageHeader } from "@/components/platform/platform-mobile-ui";

const PERMISSION_GROUPS: Record<string, string[]> = {
  Tenants: ["tenants:read", "tenants:manage"],
  Plans: ["plans:read", "plans:manage"],
  Billing: ["billing:read", "billing:manage"],
  Coupons: ["coupons:read", "coupons:manage"],
  Analytics: ["analytics:read", "growth:read"],
  System: ["system:read", "system:manage", "feature_flags:manage", "audit_logs:read"],
  Support: ["support:read", "support:manage"],
  Announcements: ["announcements:manage"],
  Users: ["users:read", "users:create", "users:update", "users:delete"],
  API: ["api_keys:manage", "impersonation:use"],
};

const ALL_PERMISSIONS = Object.values(PERMISSION_GROUPS).flat();

const BUILTIN_ROLES = ["super_admin", "admin", "support_manager", "analyst", "billing_manager", "viewer"];

interface RoleRow {
  id: string; role: string; permissions: string[];
  created_at: string; updated_at: string;
}

export default function RBACPage() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, string[] | null>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newRole, setNewRole] = useState({ role: "", permissions: [] as string[] });
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/roles", { credentials: "include" });
      const j = await res.json();
      setRoles(j.data || []);
    } catch { setRoles([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const hasEdits = (role: string) => edits[role] !== undefined && edits[role] !== null;
  const getPerms = (r: RoleRow) => edits[r.role] ?? r.permissions;

  const togglePerm = (role: string, perm: string) => {
    setEdits(prev => {
      const current = prev[role] ?? roles.find(r => r.role === role)?.permissions ?? [];
      const next = current.includes(perm) ? current.filter(p => p !== perm) : [...current, perm];
      return { ...prev, [role]: next };
    });
  };

  const toggleGroup = (role: string, perms: string[]) => {
    setEdits(prev => {
      const current = prev[role] ?? roles.find(r => r.role === role)?.permissions ?? [];
      const allIn = perms.every(p => current.includes(p));
      const next = allIn ? current.filter(p => !perms.includes(p)) : [...new Set([...current, ...perms])];
      return { ...prev, [role]: next };
    });
  };

  const saveRole = async (role: string) => {
    const perms = edits[role];
    if (!perms) return;
    await fetch("/api/platform/roles", {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, permissions: perms }),
    });
    setEdits(prev => { const n = { ...prev }; delete n[role]; return n; });
    load();
  };

  const cancelEdit = (role: string) => {
    setEdits(prev => { const n = { ...prev }; delete n[role]; return n; });
  };

  const createRole = async () => {
    if (!newRole.role || BUILTIN_ROLES.includes(newRole.role)) return;
    setSubmitting(true);
    await fetch("/api/platform/roles", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRole),
    });
    setShowCreate(false);
    setNewRole({ role: "", permissions: [] });
    setSubmitting(false);
    load();
  };

  const deleteRole = async (role: string) => {
    if (BUILTIN_ROLES.includes(role)) return;
    if (!confirm(`Delete role "${role}"?`)) return;
    await fetch(`/api/platform/roles?role=${role}`, { method: "DELETE", credentials: "include" });
    load();
  };

  return (
    <div className="space-y-6 platform-stagger">
      <PlatformPageHeader title="Roles & Permissions" subtitle="Manage platform admin roles and their permissions">
        <button onClick={load} className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-muted)]">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 rounded-lg bg-sky-500 px-3 py-2 text-sm text-white hover:bg-sky-600 platform-btn-gradient">
          <Plus className="h-4 w-4" /> New Role
        </button>
      </PlatformPageHeader>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-[var(--color-muted-fg)]">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading...
        </div>
      ) : (
        <PlatformGlassCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/30">
                  <th className="sticky left-0 bg-[var(--color-card)] px-4 py-3 text-left font-medium min-w-[160px] z-10">Permission</th>
                  {roles.map(r => (
                    <th key={r.role} className={`px-3 py-3 text-center font-medium min-w-[90px] ${hasEdits(r.role) ? "bg-amber-50 dark:bg-amber-900/20" : ""}`}>
                      <div className="flex flex-col items-center gap-1">
                        <span className="uppercase text-[10px] tracking-wider">{r.role.replace(/_/g, " ")}</span>
                        {hasEdits(r.role) && (
                          <div className="flex gap-1">
                            <button onClick={() => saveRole(r.role)} className="rounded bg-emerald-500 px-1.5 py-0.5 text-white hover:bg-emerald-600">
                              <Save className="h-3 w-3" />
                            </button>
                            <button onClick={() => cancelEdit(r.role)} className="rounded bg-gray-600 px-1.5 py-0.5 text-white hover:bg-gray-700">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(PERMISSION_GROUPS).map(([group, perms]) => (
                  <>
                    <tr key={`group-${group}`} className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/20 platform-table-row">
                      <td colSpan={roles.length + 1} className="px-4 py-2 font-semibold text-[var(--color-foreground)]">
                        {group}
                        <span className="ml-2 font-normal text-[var(--color-muted-fg)]">
                          <button onClick={() => roles.forEach(r => toggleGroup(r.role, perms))} className="hover:underline">all on</button>
                          {" / "}
                          <button onClick={() => roles.forEach(r => {
                            setEdits(prev => {
                              const current = prev[r.role] ?? r.permissions;
                              return { ...prev, [r.role]: current.filter(p => !perms.includes(p)) };
                            });
                          })} className="hover:underline">all off</button>
                        </span>
                      </td>
                    </tr>
                    {perms.map(perm => (
                      <tr key={perm} className="border-b border-[var(--color-border)] hover:bg-[var(--color-muted)]/10 platform-table-row">
                        <td className="sticky left-0 bg-[var(--color-card)] px-4 py-2 font-mono text-[11px] text-[var(--color-muted-fg)] z-10">{perm}</td>
                        {roles.map(r => {
                          const active = getPerms(r).includes(perm);
                          const isEdited = hasEdits(r.role) && (edits[r.role] ?? []).includes(perm) !== r.permissions.includes(perm);
                          return (
                            <td key={r.role} className="px-3 py-2 text-center">
                              <button
                                onClick={() => togglePerm(r.role, perm)}
                                className={`inline-block h-4 w-4 rounded ${active ? "bg-emerald-500" : "bg-gray-200 dark:bg-gray-700"} ${isEdited ? "ring-2 ring-amber-400" : ""}`}
                                title={active ? "Granted" : "Denied"}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="border-t border-[var(--color-border)] px-4 py-3 flex items-center justify-between text-xs text-[var(--color-muted-fg)]">
            <span>{roles.length} roles / {ALL_PERMISSIONS.length} permissions</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-500" /> Granted</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-gray-200 dark:bg-gray-700" /> Denied</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded ring-2 ring-amber-400" /> Unsaved</span>
            </div>
          </div>

          {/* Per-role actions */}
          <div className="border-t border-[var(--color-border)] px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {roles.map(r => (
                <div key={r.role} className="flex items-center gap-1 text-xs">
                  <span className="text-[var(--color-muted-fg)] uppercase">{r.role.replace(/_/g, " ")}:</span>
                  {hasEdits(r.role) ? (
                    <>
                      <button onClick={() => saveRole(r.role)} className="rounded bg-emerald-500 px-2 py-1 text-white hover:bg-emerald-600">Save</button>
                      <button onClick={() => cancelEdit(r.role)} className="rounded bg-gray-600 px-2 py-1 text-white hover:bg-gray-700">Cancel</button>
                    </>
                  ) : (
                    !BUILTIN_ROLES.includes(r.role) && (
                      <button onClick={() => deleteRole(r.role)} className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded p-0.5">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        </PlatformGlassCard>
      )}

      <PlatformModal open={showCreate} onClose={() => setShowCreate(false)}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Platform Role</h2>
          <button onClick={() => setShowCreate(false)} className="rounded-lg p-1 hover:bg-[var(--color-muted)]"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[var(--color-muted-fg)] mb-1 block">Role Name</label>
            <input className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-mono"
              placeholder="support_lead" value={newRole.role}
              onChange={e => setNewRole({ ...newRole, role: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted-fg)] mb-1 block">Permissions</label>
            <div className="max-h-60 overflow-y-auto space-y-2 rounded-lg border border-[var(--color-border)] p-3">
              {Object.entries(PERMISSION_GROUPS).map(([group, perms]) => (
                <div key={group}>
                  <label className="flex items-center gap-2 text-xs font-semibold mb-1 cursor-pointer">
                    <input type="checkbox" checked={perms.every(p => newRole.permissions.includes(p))}
                      onChange={() => {
                        const allIn = perms.every(p => newRole.permissions.includes(p));
                        const next = allIn
                          ? newRole.permissions.filter(p => !perms.includes(p))
                          : [...new Set([...newRole.permissions, ...perms])];
                        setNewRole({ ...newRole, permissions: next });
                      }}
                      className="h-3 w-3 rounded accent-sky-500" />
                    {group}
                  </label>
                  {perms.map(p => (
                    <label key={p} className="flex items-center gap-2 text-[11px] font-mono ml-5 cursor-pointer">
                      <input type="checkbox" checked={newRole.permissions.includes(p)}
                        onChange={() => {
                          const next = newRole.permissions.includes(p)
                            ? newRole.permissions.filter(x => x !== p)
                            : [...newRole.permissions, p];
                          setNewRole({ ...newRole, permissions: next });
                        }}
                        className="h-3 w-3 rounded accent-sky-500" />
                      {p}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setShowCreate(false)} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-muted)]">Cancel</button>
          <button onClick={createRole} disabled={!newRole.role || submitting}
            className="flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm text-white hover:bg-sky-600 disabled:opacity-50 platform-btn-gradient">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Create
          </button>
        </div>
      </PlatformModal>
    </div>
  );
}
