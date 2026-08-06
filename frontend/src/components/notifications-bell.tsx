"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";

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

export default function NotificationsBell({ basePath }: { basePath: string }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotifRow[]>([]);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count", { cache: "no-store" });
      const body = await res.json();
      if (res.ok) setUnread(body.data?.unread ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  const loadItems = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/notifications?pageSize=8", { cache: "no-store" });
      const body = await res.json();
      if (res.ok) {
        setItems(body.data ?? []);
        setUnread((body.data ?? []).filter((n: NotifRow) => !n.is_read).length);
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadCount();
    const t = setInterval(loadCount, 30000);
    return () => clearInterval(t);
  }, [loadCount]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function markAllRead() {
    const unreadIds = items.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await Promise.all(unreadIds.map((id) => fetch(`/api/notifications/${id}`, { method: "PUT" }).catch(() => {})));
    setUnread(0);
    setItems((rows) => rows.map((n) => ({ ...n, is_read: true })));
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadItems();
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        className="focus-ring relative rounded-lg p-2 text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-slate-100"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
      >
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-xl)] sm:w-96">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
            <p className="text-sm font-semibold text-[var(--color-foreground)]">Notifications</p>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unread === 0}
              className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] disabled:opacity-50"
            >
              <CheckCheck size={13} /> Mark All Read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {busy && items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--color-muted-fg)]">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--color-muted-fg)]">No notifications yet.</p>
            ) : (
              items.map((n) => (
                <div key={n.id} className={`border-b border-[var(--color-border)] px-4 py-3 last:border-b-0 ${!n.is_read ? "bg-[var(--color-primary-soft)]/40" : ""}`}>
                  <p className={`text-sm ${n.is_read ? "font-medium text-[var(--color-foreground)]" : "font-semibold text-[var(--color-foreground)]"}`}>
                    {n.title ?? "Notification"}
                  </p>
                  {n.message && <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-muted-fg)]">{n.message}</p>}
                  <p className="mt-1 text-[10px] text-[var(--color-muted-fg)]">{timeAgo(n.created_at)}</p>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-[var(--color-border)] px-4 py-2.5">
            <Link href={`${basePath}/notifications`} onClick={() => setOpen(false)} className="text-xs font-medium text-[var(--color-primary)] hover:underline">
              View all →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}