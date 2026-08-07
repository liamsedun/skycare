"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, Loader2, Megaphone, Trash2 } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

interface NotifRow {
  id: string;
  title: string | null;
  message: string | null;
  event: string | null;
  is_read: boolean;
  created_at: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function NotificationsView() {
  const [items, setItems] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [isAdmin, setIsAdmin] = useState(false);

  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [annBusy, setAnnBusy] = useState(false);
  const [annDone, setAnnDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const me = await meRes.json();
      const role = me.data?.claims?.role;
      setIsAdmin(role === "hospital_admin" || role === "super_admin");

      const res = await fetch(`/api/notifications?pageSize=100${filter === "unread" ? "&unread_only=true" : ""}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load notifications");
      setItems(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id: string) {
    const res = await fetch(`/api/notifications/${id}`, { method: "PUT" });
    if (res.ok) setItems((rows) => rows.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }

  async function remove(id: string) {
    const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    if (res.ok) setItems((rows) => rows.filter((n) => n.id !== id));
  }

  async function markAllRead() {
    const unread = items.filter((n) => !n.is_read);
    await Promise.all(unread.map((n) => fetch(`/api/notifications/${n.id}`, { method: "PUT" }).catch(() => {})));
    await load();
  }

  async function sendAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    if (!annTitle.trim()) return;
    setAnnBusy(true);
    setAnnDone(false);
    setError(null);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: annTitle.trim(), message: annBody.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to send announcement");
      setAnnTitle("");
      setAnnBody("");
      setAnnDone(true);
      setTimeout(() => setAnnDone(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send announcement");
    } finally {
      setAnnBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Notifications</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Updates from your hospital.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-[var(--color-border)] bg-white p-0.5">
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`focus-ring rounded-md px-3 py-1.5 text-xs font-semibold ${filter === f ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]" : "text-[var(--color-muted-fg)]"}`}
              >
                {f === "all" ? "All" : "Unread"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={markAllRead}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-foreground)] hover:bg-slate-50"
          >
            <CheckCheck size={14} /> Mark All Read
          </button>
        </div>
      </div>

      {isAdmin && (
        <form onSubmit={sendAnnouncement} className="rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]">
            <Megaphone size={15} className="text-[var(--color-primary)]" /> Send an announcement to all staff
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="ann-title">Title</label>
              <input id="ann-title" className={inputCls} value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder="e.g. Staff meeting Friday 4pm" required />
            </div>
            <div>
              <label className={labelCls} htmlFor="ann-body">Message (optional)</label>
              <input id="ann-body" className={inputCls} value={annBody} onChange={(e) => setAnnBody(e.target.value)} placeholder="Details…" />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={annBusy}
              className="focus-ring rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
            >
              {annBusy ? "Sending…" : "Send announcement"}
            </button>
          </div>
          {annDone && <p role="status" className="mt-2 text-sm font-medium text-emerald-600">Announcement sent to all staff.</p>}
        </form>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} aria-hidden="true" className="animate-spin text-[var(--color-muted-fg)]" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <Bell size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">No notifications.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <div
              key={n.id}
              className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3.5 shadow-[var(--shadow-sm)] ${n.is_read ? "border-[var(--color-border)] bg-white" : "border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)]/30"}`}
            >
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${n.is_read ? "font-medium" : "font-semibold"} text-[var(--color-foreground)]`}>{n.title ?? "Notification"}</p>
                {n.message && <p className="mt-0.5 whitespace-pre-wrap text-xs text-[var(--color-muted-fg)]">{n.message}</p>}
                <p className="mt-1 text-[10px] text-[var(--color-muted-fg)]">{timeAgo(n.created_at)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {!n.is_read && (
                  <button
                    type="button"
                    onClick={() => markRead(n.id)}
                    className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-slate-50"
                    aria-label="Mark as read"
                    title="Mark as read"
                  >
                    <CheckCheck size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-red-50 hover:text-[var(--color-destructive)]"
                  aria-label="Delete notification"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}