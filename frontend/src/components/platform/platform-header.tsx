"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Settings,
  User,
  MessageSquare,
  LifeBuoy,
  LogOut,
  ChevronDown,
  CheckCheck,
  Moon,
  Sun,
} from "lucide-react";
import { applyTheme, readStoredTheme } from "@/lib/theme";
import type { ThemeMode } from "@/lib/theme";

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

export default function PlatformHeader({
  userName,
  userEmail,
  userAvatar,
}: {
  userName: string;
  userEmail: string;
  userAvatar?: string | null;
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotifRow[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => { setTheme(readStoredTheme()); }, []);

  const loadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count", { cache: "no-store", credentials: "include" });
      const body = await res.json();
      if (res.ok) setUnread(body.data?.unread ?? 0);
    } catch { /* ignore */ }
  }, []);

  const loadItems = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?pageSize=8", { cache: "no-store", credentials: "include" });
      const body = await res.json();
      if (res.ok) setItems(body.data?.rows ?? body.data ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadCount();
    const t = setInterval(loadCount, 30000);
    return () => clearInterval(t);
  }, [loadCount]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggleNotif() {
    const next = !notifOpen;
    setNotifOpen(next);
    setProfileOpen(false);
    if (next) loadItems();
  }

  function toggleProfile() {
    const next = !profileOpen;
    setProfileOpen(next);
    setNotifOpen(false);
  }

  function toggleTheme() {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    fetch("/api/account/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ theme: next }),
    }).catch(() => {});
  }

  async function markAllRead() {
    try {
      const unreadItems = items.filter((i) => !i.is_read);
      await Promise.all(
        unreadItems.map((i) =>
          fetch(`/api/notifications/${i.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ is_read: true }),
          })
        )
      );
      setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
      setUnread(0);
    } catch { /* ignore */ }
  }

  const initials = userName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-end border-b border-[var(--color-border)] bg-[var(--color-background)] px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-1.5">
        {/* ── Notification Bell ── */}
        <div ref={notifRef} className="relative">
          <button
            onClick={toggleNotif}
            className="relative rounded-xl p-2 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)] transition-all duration-200 hover:scale-105 active:scale-95"
            aria-label="Notifications"
          >
            <Bell size={20} />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm animate-[platform-number-pop_0.3s_ease-out]">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl platform-dropdown">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
                <span className="text-sm font-semibold text-[var(--color-foreground)]">Notifications</span>
                {unread > 0 && (
                  <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 transition-colors">
                    <CheckCheck size={12} /> Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {items.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <Bell className="mx-auto mb-2 h-8 w-8 text-[var(--color-muted-fg)] opacity-40" />
                    <p className="text-sm text-[var(--color-muted-fg)]">No notifications yet</p>
                  </div>
                ) : (
                  items.map((n) => (
                    <div
                      key={n.id}
                      className={`border-b border-[var(--color-border)] px-4 py-3 last:border-0 transition-colors hover:bg-[var(--color-muted)]/50 ${!n.is_read ? "bg-sky-50/50 dark:bg-sky-900/10" : ""}`}
                    >
                      <div className="flex items-start gap-2.5">
                        {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-500 shadow-sm shadow-sky-500/50" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[var(--color-foreground)] truncate">{n.title || n.event || "Notification"}</p>
                          {n.message && <p className="mt-0.5 text-xs text-[var(--color-muted-fg)] line-clamp-2">{n.message}</p>}
                          <p className="mt-1 text-[10px] text-[var(--color-muted-fg)]">{timeAgo(n.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <Link
                href="/platform/announcements"
                onClick={() => setNotifOpen(false)}
                className="block border-t border-[var(--color-border)] px-4 py-3 text-center text-xs font-medium text-sky-600 hover:bg-[var(--color-muted)]/50 transition-colors"
              >
                View announcements
              </Link>
            </div>
          )}
        </div>

        {/* ── Profile Dropdown ── */}
        <div ref={profileRef} className="relative">
          <button
            onClick={toggleProfile}
            className="flex items-center gap-2 rounded-xl p-1.5 pr-2 hover:bg-[var(--color-muted)] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            {userAvatar ? (
              <img src={userAvatar} alt="" className="h-8 w-8 rounded-full object-cover ring-2 ring-sky-200 dark:ring-sky-800 shadow-sm" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-xs font-bold text-white shadow-sm shadow-sky-500/20">
                {initials}
              </div>
            )}
            <ChevronDown size={14} className={`text-[var(--color-muted-fg)] transition-transform duration-200 hidden sm:block ${profileOpen ? "rotate-180" : ""}`} />
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl platform-dropdown">
              <div className="border-b border-[var(--color-border)] px-4 py-3">
                <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">{userName}</p>
                <p className="text-xs text-[var(--color-muted-fg)] truncate">{userEmail}</p>
              </div>
              <div className="py-1.5">
                <Link href="/platform/profile" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/60 transition-colors rounded-lg mx-1.5">
                  <User size={16} className="text-[var(--color-muted-fg)]" /> Profile
                </Link>
                <Link href="/platform/settings" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/60 transition-colors rounded-lg mx-1.5">
                  <Settings size={16} className="text-[var(--color-muted-fg)]" /> Settings
                </Link>
                <button onClick={toggleTheme} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/60 transition-colors rounded-lg mx-1.5">
                  {theme === "dark" ? <Sun size={16} className="text-[var(--color-muted-fg)]" /> : <Moon size={16} className="text-[var(--color-muted-fg)]" />}
                  {theme === "dark" ? "Light Mode" : "Dark Mode"}
                </button>
                <Link href="/platform/support" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/60 transition-colors rounded-lg mx-1.5">
                  <LifeBuoy size={16} className="text-[var(--color-muted-fg)]" /> Support Tickets
                </Link>
                <Link href="/app/chats" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/60 transition-colors rounded-lg mx-1.5">
                  <MessageSquare size={16} className="text-[var(--color-muted-fg)]" /> Chats
                </Link>
              </div>
              <div className="border-t border-[var(--color-border)] py-1.5">
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    import("@/lib/supabase/client").then(({ getSupabase }) =>
                      getSupabase().auth.signOut().then(() => { window.location.href = "/platform/login"; })
                    );
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors rounded-lg mx-1.5"
                >
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
