"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Loader2, MailPlus, Send } from "lucide-react";
import { initials, ROLE_LABELS } from "@/lib/auth";
import type { AppRole } from "@/lib/auth";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

interface MailMessage {
  id: string;
  recipientRowId?: string;
  subject: string;
  body: string;
  is_broadcast: boolean;
  broadcast_scope: string;
  created_at: string;
  isRead?: boolean;
  sender?: { id: string; full_name: string; email: string; role: AppRole } | null;
  recipients?: Array<{ id: string; full_name: string; email: string }>;
}

interface RecipientOption {
  id: string;
  full_name: string;
  email: string;
  role: AppRole;
}

type Tab = "inbox" | "sent" | "compose";

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

export default function MailView() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [inbox, setInbox] = useState<MailMessage[]>([]);
  const [sent, setSent] = useState<MailMessage[]>([]);
  const [recipients, setRecipients] = useState<RecipientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const [to, setTo] = useState<string[]>([]);
  const [broadcast, setBroadcast] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);

  const loadTab = useCallback(async (t: Tab) => {
    setLoading(true);
    setError(null);
    try {
      if (t === "inbox") {
        const res = await fetch("/api/mail/inbox?pageSize=100", { cache: "no-store" });
        const b = await res.json();
        if (!res.ok) throw new Error(b.error ?? "Failed to load inbox");
        setInbox(b.data ?? []);
      } else if (t === "sent") {
        const res = await fetch("/api/mail/sent?pageSize=100", { cache: "no-store" });
        const b = await res.json();
        if (!res.ok) throw new Error(b.error ?? "Failed to load sent mail");
        setSent(b.data ?? []);
      } else if (t === "compose") {
        const res = await fetch("/api/mail/recipients", { cache: "no-store" });
        const b = await res.json();
        if (!res.ok) throw new Error(b.error ?? "Failed to load recipients");
        setRecipients(b.data?.staff ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load mail");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTab(tab);
  }, [tab, loadTab]);

  async function markRead(rowId: string) {
    await fetch(`/api/mail/${rowId}/read`, { method: "PUT" }).catch(() => {});
    setInbox((rows) => rows.map((r) => (r.recipientRowId === rowId ? { ...r, isRead: true } : r)));
  }

  function openMessage(msg: MailMessage) {
    setOpenId(msg.id);
    if (msg.recipientRowId && !msg.isRead) markRead(msg.recipientRowId);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    setSentOk(false);
    try {
      const res = await fetch("/api/mail/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(broadcast ? { subject, body, broadcast: true, broadcastScope: "staff" } : { recipientIds: to, subject, body }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "Failed to send");
      setTo([]);
      setSubject("");
      setBody("");
      setBroadcast(false);
      setSentOk(true);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  const inboxUnread = useMemo(() => inbox.filter((m) => !m.isRead).length, [inbox]);

  const tabs: Array<{ key: Tab; label: string; icon: typeof Inbox }> = [
    { key: "inbox", label: "Inbox", icon: Inbox },
    { key: "sent", label: "Sent", icon: Send },
    { key: "compose", label: "Compose", icon: MailPlus },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-foreground)]">Internal mail</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Messaging between hospital staff.</p>
      </div>

      <div className="flex gap-1 rounded-lg border border-[var(--color-border)] bg-white p-1 shadow-[var(--shadow-sm)]">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`focus-ring flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                tab === t.key ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]" : "text-[var(--color-muted-fg)] hover:bg-slate-50"
              }`}
            >
              <Icon size={15} aria-hidden="true" />
              {t.label}
              {t.key === "inbox" && inboxUnread > 0 && (
                <span className="rounded-full bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-bold text-white">{inboxUnread}</span>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}
      {sentOk && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          Message sent.
        </p>
      )}

      {tab === "compose" ? (
        <form onSubmit={send} className="mx-auto max-w-2xl rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]">
          <div className="space-y-4">
            <label className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] p-3">
              <input
                type="checkbox"
                checked={broadcast}
                onChange={(e) => setBroadcast(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              <span className="text-sm">
                <span className="font-medium text-[var(--color-foreground)]">Broadcast to all staff</span>
                <span className="block text-xs text-[var(--color-muted-fg)]">Every staff member in this hospital receives the message.</span>
              </span>
            </label>

            {!broadcast && (
              <div>
                <label className={labelCls} htmlFor="mail-to">To *</label>
                <div className="flex flex-wrap gap-1.5 rounded-lg border border-[var(--color-border)] bg-white p-2">
                  {to.map((id) => {
                    const opt = recipients.find((r) => r.id === id);
                    return (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-soft)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary-dark)]">
                        {opt?.full_name ?? "?"}
                        <button type="button" onClick={() => setTo((t) => t.filter((x) => x !== id))} className="hover:text-[var(--color-destructive)]" aria-label={`Remove ${opt?.full_name}`}>×</button>
                      </span>
                    );
                  })}
                  <select
                    aria-label="Add recipient"
                    value=""
                    onChange={(e) => {
                      if (e.target.value && !to.includes(e.target.value)) setTo((t) => [...t, e.target.value]);
                    }}
                    className="min-w-32 flex-1 bg-transparent px-1 text-sm outline-none"
                  >
                    <option value="">Add recipient…</option>
                    {recipients.map((r) => (
                      <option key={r.id} value={r.id} disabled={to.includes(r.id)}>
                        {r.full_name} ({ROLE_LABELS[r.role] ?? r.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className={labelCls} htmlFor="mail-subject">Subject *</label>
              <input id="mail-subject" required className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="mail-body">Message *</label>
              <textarea id="mail-body" required rows={6} className={inputCls} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" />
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={sending || (!broadcast && to.length === 0)}
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
            >
              <Send size={15} aria-hidden="true" /> {sending ? "Sending…" : "Send message"}
            </button>
          </div>
        </form>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} aria-hidden="true" className="animate-spin text-[var(--color-muted-fg)]" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
          <ul className="divide-y divide-[var(--color-border)]">
            {(tab === "inbox" ? inbox : sent).length === 0 && (
              <li className="px-4 py-12 text-center text-sm text-[var(--color-muted-fg)]">
                {tab === "inbox" ? "No messages yet." : "Nothing sent yet."}
              </li>
            )}
            {(tab === "inbox" ? inbox : sent).map((m) => {
              const open = openId === m.id;
              const person = tab === "inbox" ? m.sender : null;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => openMessage(m)}
                    className={`focus-ring flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${open ? "bg-[var(--color-muted)]/40" : ""}`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${m.isRead ? "bg-slate-300" : "bg-[var(--color-primary)]"}`}>
                      {initials(tab === "inbox" ? (person?.full_name ?? "?") : "Me")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-sm ${m.isRead ? "font-medium text-[var(--color-foreground)]" : "font-bold text-[var(--color-foreground)]"}`}>
                          {m.subject}
                        </span>
                        <span className="shrink-0 text-xs text-[var(--color-muted-fg)]">{timeAgo(m.created_at)}</span>
                      </span>
                      <span className="block truncate text-xs text-[var(--color-muted-fg)]">
                        {tab === "inbox" ? (person?.full_name ?? "Unknown") + (m.is_broadcast ? " · Broadcast" : "") : `${m.recipients?.length ?? 0} recipient(s)`}
                        {!m.isRead && tab === "inbox" ? " · Unread" : ""}
                      </span>
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-[var(--color-border)] bg-[var(--color-muted)]/20 px-4 py-4">
                      <div className="whitespace-pre-wrap text-sm text-[var(--color-foreground)]">{m.body}</div>
                      {tab === "sent" && m.recipients && m.recipients.length > 0 && (
                        <p className="mt-3 text-xs text-[var(--color-muted-fg)]">
                          To: {m.recipients.map((r) => r.full_name || r.email).join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}