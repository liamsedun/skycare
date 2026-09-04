"use client";

import { useEffect, useState } from "react";
import {
  Plus, RefreshCw, Info, AlertTriangle, AlertOctagon, Wrench,
  Globe, Building2, Trash2, Loader2, X,
} from "lucide-react";
import { PlatformGlassCard, PlatformPageHeader, StatusChip, PlatformEmpty, PlatformSheet } from "@/components/platform/platform-mobile-ui";

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  info: Info, warning: AlertTriangle, important: AlertOctagon, maintenance: Wrench,
};
const TYPE_COLORS: Record<string, string> = {
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  important: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  maintenance: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

interface Announcement {
  id: string; title: string; message: string; type: string; is_global: boolean;
  tenant_id: string | null; starts_at: string; ends_at: string | null;
  is_dismissable: boolean; created_at: string; user_id: string;
  user?: { full_name: string } | null;
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: "", message: "", type: "info", is_global: true,
    tenant_id: "", starts_at: "", ends_at: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/announcements?pageSize=200", { credentials: "include" });
      const j = await res.json();
      setAnnouncements(j.data?.rows || []);
    } catch { setAnnouncements([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const now = new Date();
  const active = announcements.filter(a => {
    const s = new Date(a.starts_at);
    const e = a.ends_at ? new Date(a.ends_at) : null;
    return s <= now && (!e || e >= now);
  });
  const past = announcements.filter(a => {
    const e = a.ends_at ? new Date(a.ends_at) : null;
    return e && e < now;
  });

  const create = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/platform/announcements", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title, message: form.message, type: form.type,
          is_global: form.is_global,
          tenant_id: form.is_global ? null : form.tenant_id || null,
          starts_at: form.starts_at || undefined,
          ends_at: form.ends_at || undefined,
        }),
      });
      setShowCreate(false);
      setForm({ title: "", message: "", type: "info", is_global: true, tenant_id: "", starts_at: "", ends_at: "" });
      load();
    } catch {}
    setSubmitting(false);
  };

  const deleteAnnouncement = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    await fetch(`/api/platform/announcements?id=${id}`, { method: "DELETE", credentials: "include" });
    load();
  };

  const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6 platform-stagger">
      <PlatformPageHeader title="Announcements" subtitle="Send announcements to tenants">
        <button onClick={load} className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-muted)]">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 rounded-lg bg-sky-500 px-3 py-2 text-sm text-white hover:bg-sky-600 platform-btn-gradient">
          <Plus className="h-4 w-4" /> New Announcement
        </button>
      </PlatformPageHeader>

      <PlatformGlassCard>
        <h2 className="text-sm font-semibold mb-3">Active Announcements <span className="text-[var(--color-muted-fg)] font-normal">({active.length} active / {announcements.length} total)</span></h2>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-[var(--color-muted-fg)]">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : active.length === 0 ? (
          <PlatformEmpty
            icon={<Info className="h-5 w-5" />}
            title="No active announcements"
            hint="Active announcements will appear here"
          />
        ) : (
          <div className="space-y-3">
            {active.map(a => {
              const Icon = TYPE_ICONS[a.type] || Info;
              return (
                <div key={a.id} className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] p-3">
                  <div className={`rounded-lg p-2 ${TYPE_COLORS[a.type] || ""}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm">{a.title}</h3>
                      <StatusChip status={a.type} />
                      {a.is_global ? (
                        <StatusChip status="active" label="Global" />
                      ) : (
                        <StatusChip status="inactive" label="Tenant" />
                      )}
                    </div>
                    <p className="text-sm text-[var(--color-muted-fg)] mt-1 whitespace-pre-wrap">{a.message}</p>
                    <div className="text-xs text-[var(--color-muted-fg)] mt-2">
                      {fmtDate(a.starts_at)} — {a.ends_at ? fmtDate(a.ends_at) : "No end date"}
                    </div>
                  </div>
                  <button onClick={() => deleteAnnouncement(a.id)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </PlatformGlassCard>

      {past.length > 0 && (
        <PlatformGlassCard className="!p-0 overflow-x-auto">
          <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-muted)]/30">
            <h2 className="text-sm font-semibold">Past Announcements ({past.length})</h2>
          </div>
          <table className="w-full min-w-[500px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left">
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Scope</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {past.map(a => (
                <tr key={a.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-muted)]/20 platform-table-row">
                  <td className="px-4 py-2 font-medium">{a.title}</td>
                  <td className="px-4 py-2">
                    <StatusChip status={a.type} />
                  </td>
                  <td className="px-4 py-2 text-[var(--color-muted-fg)]">{a.is_global ? "Global" : "Tenant"}</td>
                  <td className="px-4 py-2 text-xs text-[var(--color-muted-fg)]">{fmtDate(a.created_at)}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => deleteAnnouncement(a.id)} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PlatformGlassCard>
      )}

      <PlatformSheet open={showCreate} onClose={() => setShowCreate(false)} title="New Announcement">
        <div className="space-y-3">
          <input className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
            placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <select className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
            value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="important">Important</option>
            <option value="maintenance">Maintenance</option>
          </select>
          <textarea className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm min-h-[100px] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
            placeholder="Announcement message…" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.is_global} onChange={e => setForm({ ...form, is_global: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 accent-sky-500" />
            Global announcement (all tenants)
          </label>
          {!form.is_global && (
            <input className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
              placeholder="Tenant ID (blank = global)" value={form.tenant_id} onChange={e => setForm({ ...form, tenant_id: e.target.value })} />
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--color-muted-fg)] mb-1 block">Start Date</label>
              <input type="datetime-local" className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
                value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted-fg)] mb-1 block">End Date (optional)</label>
              <input type="datetime-local" className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
                value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setShowCreate(false)} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-muted)]">Cancel</button>
          <button onClick={create} disabled={!form.title || !form.message || submitting}
            className="flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm text-white hover:bg-sky-600 disabled:opacity-50 platform-btn-gradient">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Create
          </button>
        </div>
      </PlatformSheet>
    </div>
  );
}
