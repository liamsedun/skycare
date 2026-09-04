"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  UserPlus,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { PlatformGlassCard, PlatformPageHeader, StatusChip, PlatformSheet } from "@/components/platform/platform-mobile-ui";

interface PlatformUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function PlatformAdminPage() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [showFormPassword, setShowFormPassword] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const res = await fetch("/api/platform/admin/users", { credentials: "include", cache: "no-store" });
      if (res.ok) {
        const body = await res.json();
        setUsers(body.data || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/platform/admin/users", { credentials: "include", method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formEmail,
          password: formPassword,
          full_name: formName,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Failed to create user");
        return;
      }

      setSuccess(`Admin user "${formName}" created successfully.`);
      setShowCreate(false);
      setFormName("");
      setFormEmail("");
      setFormPassword("");
      fetchUsers();
    } catch {
      setError("Failed to create user.");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 platform-stagger">
      <PlatformPageHeader title="Platform Admins" subtitle="Manage who has access to this portal">
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 platform-btn-gradient"
        >
          <UserPlus className="h-4 w-4" />
          Add Admin
        </button>
      </PlatformPageHeader>

      {/* Banners */}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
          {success}
        </div>
      )}
      {error && !showCreate && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Users table */}
      <PlatformGlassCard className="!p-0 overflow-x-auto">
        <table className="w-full min-w-[500px] text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium text-[var(--color-muted-fg)]">Name</th>
              <th className="px-4 py-3 font-medium text-[var(--color-muted-fg)]">Email</th>
              <th className="px-4 py-3 font-medium text-[var(--color-muted-fg)]">Role</th>
              <th className="px-4 py-3 font-medium text-[var(--color-muted-fg)]">Created</th>
              <th className="px-4 py-3 font-medium text-[var(--color-muted-fg)]">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {users.map((u) => (
              <tr key={u.id} className="transition-colors hover:bg-[var(--color-muted)]/50 platform-table-row">
                <td className="px-4 py-3 font-medium text-[var(--color-foreground)]">
                  {u.full_name}
                </td>
                <td className="px-4 py-3 text-[var(--color-muted-fg)]"><a href={`mailto:${u.email}`} className="hover:underline">{u.email}</a></td>
                <td className="px-4 py-3">
                  <StatusChip status={u.role} label={u.role} />
                </td>
                <td className="px-4 py-3 text-[var(--color-muted-fg)]">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <StatusChip status={u.is_active ? "active" : "inactive"} />
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-muted-fg)]">
                  No platform admin users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </PlatformGlassCard>

      {/* Create modal */}
      <PlatformSheet open={showCreate} onClose={() => { setShowCreate(false); setError(null); }} title="Create Platform Admin">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-foreground)]">
              Full Name
            </label>
            <input
              type="text"
              required
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="John Smith"
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-[var(--color-foreground)] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-foreground)]">
              Email
            </label>
            <input
              type="email"
              required
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              placeholder="admin@skycare.app"
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-[var(--color-foreground)] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-foreground)]">
              Password
            </label>
            <div className="relative">
              <input
                type={showFormPassword ? "text" : "password"}
                required
                minLength={8}
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 pr-10 text-sm text-[var(--color-foreground)] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowFormPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-muted-fg)] hover:text-[var(--color-foreground)]"
              >
                {showFormPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setShowCreate(false); setError(null); }}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-[var(--color-muted-fg)] transition hover:bg-[var(--color-muted)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50 platform-btn-gradient"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {creating ? "Creating..." : "Create Admin"}
            </button>
          </div>
        </form>
      </PlatformSheet>
    </div>
  );
}
