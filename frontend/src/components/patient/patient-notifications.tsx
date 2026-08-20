"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, Loader2, Trash2 } from "lucide-react";
import { inDateRange } from "@/lib/daterange";
import { errorBanner, mutedSm, flexGap2, sectionTitle, pageTitle } from "@/lib/ui-constants";
import DateRangeBar from "@/components/filters/date-range-bar";
import {
  AppHeader,
  AppSegmented,
  AppSkeletonList,
} from "@/components/patient/mobile/mobile-app-ui";

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

export default function PatientNotifications() {
  const [items, setItems] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
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
    if (res.ok) {
      setItems((rows) => rows.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      window.dispatchEvent(new Event("skycare:notifs-changed"));
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((rows) => rows.filter((n) => n.id !== id));
      window.dispatchEvent(new Event("skycare:notifs-changed"));
    }
  }

  async function markAllRead() {
    const unread = items.filter((n) => !n.is_read);
    await Promise.all(unread.map((n) => fetch(`/api/notifications/${n.id}`, { method: "PUT" }).catch(() => {})));
    await load();
    window.dispatchEvent(new Event("skycare:notifs-changed"));
  }

  const visible = items.filter((n) => inDateRange(n.created_at, from, to));

  return (
    <>
      <div className="hidden md:block">
        <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={pageTitle}>Notifications</h1>
          <p className={mutedSm}>Updates from your hospital.</p>
        </div>
        <div className={flexGap2}>
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
          {items.some((n) => !n.is_read) && (
            <button
              type="button"
              onClick={markAllRead}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-foreground)] hover:bg-slate-50"
            >
              <CheckCheck size={14} /> Mark All Read
            </button>
          )}
        </div>
      </div>

      <DateRangeBar from={from} to={to} onFromChange={setFrom} onToChange={setTo} onClear={() => { setFrom(""); setTo(""); }} />

      {error && (
        <p role="alert" className={errorBanner}>
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} aria-hidden="true" className="animate-spin text-[var(--color-muted-fg)]" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <Bell size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className={sectionTitle}>No notifications.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((n) => (
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
      </div>

      {/* ── Mobile app view (Life Blossom parity, <md) ─────────────────── */}
      <div className="md:hidden">
        <div className="space-y-4">
          <AppHeader title="Notifications" meta={`${items.filter((n) => !n.is_read).length} unread`} />

          <AppSegmented<"all" | "unread">
            tabs={[
              { key: "all", label: "All" },
              { key: "unread", label: "Unread" },
            ]}
            active={filter}
            onChange={setFilter}
          />

          {items.some((n) => !n.is_read) && (
            <button
              type="button"
              onClick={markAllRead}
              className="focus-ring flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[#e0a84a]/25 bg-[#e0a84a]/10 text-xs font-semibold text-[#e0a84a]"
            >
              <CheckCheck size={14} aria-hidden="true" /> Mark All Read
            </button>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
              {error}
            </p>
          )}

          {loading ? (
            <AppSkeletonList rows={4} />
          ) : visible.length === 0 ? (
            <div className="app-glass rounded-2xl py-10 text-center">
              <Bell size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
              <p className={sectionTitle}>
                {filter === "unread" ? "You're all caught up." : "No notifications."}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {visible.map((n) => (
                <div
                  key={n.id}
                  className={`rounded-2xl p-4 ${
                    n.is_read
                      ? "app-glass"
                      : "border border-[#e0a84a]/25 bg-[#e0a84a]/[0.06]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        n.is_read ? "bg-[var(--color-muted)]/40 text-[var(--color-muted-fg)]" : "bg-[#e0a84a]/15 text-[#e0a84a]"
                      }`}
                    >
                      <Bell size={16} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm ${n.is_read ? "font-medium" : "font-semibold"} text-[var(--color-foreground)]`}>
                          {n.title ?? "Notification"}
                        </p>
                        {!n.is_read && <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#e0a84a]" />}
                      </div>
                      {n.message && (
                        <p className="mt-0.5 whitespace-pre-wrap text-xs text-[var(--color-muted-fg)]">{n.message}</p>
                      )}
                      <p className="mt-1 text-[10px] text-[var(--color-muted-fg)]">{timeAgo(n.created_at)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      {!n.is_read && (
                        <button
                          type="button"
                          onClick={() => markRead(n.id)}
                          className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-[#e0a84a]/25 text-[#e0a84a]"
                          aria-label="Mark as read"
                          title="Mark as read"
                        >
                          <CheckCheck size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(n.id)}
                        className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-rose-50 hover:text-[var(--color-destructive)]"
                        aria-label="Delete notification"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
