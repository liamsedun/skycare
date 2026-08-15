"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox, Loader2, MailPlus, Send, Trash2 } from "lucide-react";
import { initials } from "@/lib/auth";
import { inDateRange } from "@/lib/daterange";
import DateRangeBar from "@/components/filters/date-range-bar";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

interface MailMessage {
  id: string;
  recipientRowId?: string;
  subject: string;
  body: string;
  is_broadcast: boolean;
  created_at: string;
  isRead?: boolean;
  sender?: { id: string; full_name: string } | null;
  recipients?: Array<{ id: string; full_name: string }>;
}

interface RecipientOption {
  id: string;
  full_name: string;
  role: string;
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

const emptyCard = (msg: string) => (
  <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
    <Inbox size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
    <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">{msg}</p>
  </div>
);

export default function PatientMail() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [inbox, setInbox] = useState<MailMessage[]>([]);
  const [sent, setSent] = useState<MailMessage[]>([]);
  const [recipients, setRecipients] = useState<RecipientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const [to, setTo] = useState<string[]>([]);
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

  async function markRead(msg: MailMessage) {
    if (msg.isRead || !msg.recipientRowId) return;
    fetch(`/api/mail/${msg.recipientRowId}/read`, { method: "PUT" }).catch(() => {});
    setInbox((rows) => rows.map((r) => (r.id === msg.id ? { ...r, isRead: true } : r)));
  }

  function toggleOpen(id: string, msg: MailMessage) {
    const next = openId === id ? null : id;
    setOpenId(next);
    if (next) markRead(msg);
  }

  async function removeMessage(m: MailMessage) {
    if (!confirm(`Delete this ${tab === "inbox" ? "message" : "sent message"}?`)) return;
    setError(null);
    try {
      const id = tab === "inbox" ? m.recipientRowId : m.id;
      if (!id) return;
      const res = await fetch(`/api/mail/${id}?view=${tab}`, { method: "DELETE" });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "Failed to delete message");
      if (tab === "inbox") setInbox((rows) => rows.filter((r) => r.recipientRowId !== id));
      else setSent((rows) => rows.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete message");
    }
  }

  function toggleRecipient(id: string) {
    setTo((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function sendMail(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) {
      setError("Subject and message are required");
      return;
    }
    if (to.length === 0) {
      setError("Choose at least one staff member");
      return;
    }
    setSending(true);
    setError(null);
    setSentOk(false);
    try {
      const res = await fetch("/api/mail/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientIds: to, subject: subject.trim(), body: body.trim() }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "Failed to send");
      setSentOk(true);
      setSubject("");
      setBody("");
      setTo([]);
      setTimeout(() => setSentOk(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "inbox", label: "Inbox", count: inbox.filter((m) => !m.isRead).length },
    { id: "sent", label: "Sent" },
    { id: "compose", label: "Compose" },
  ];

  const visibleInbox = inbox.filter((m) => inDateRange(m.created_at, filterFrom, filterTo));
  const visibleSent = sent.filter((m) => inDateRange(m.created_at, filterFrom, filterTo));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Messages</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Internal mail with hospital staff.</p>
      </div>

      <div className="flex gap-2 border-b border-[var(--color-border)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`focus-ring -mb-px inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-[var(--color-primary)] text-[var(--color-primary-dark)]"
                : "border-transparent text-[var(--color-muted-fg)] hover:text-[var(--color-foreground)]"
            }`}
          >
            {t.id === "inbox" ? <Inbox size={15} /> : t.id === "sent" ? <Send size={15} /> : <MailPlus size={15} />}
            {t.label}
            {t.count ? (
              <span className="rounded-full bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-bold text-white">{t.count}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab !== "compose" && (
        <DateRangeBar from={filterFrom} to={filterTo} onFromChange={setFilterFrom} onToChange={setFilterTo} onClear={() => { setFilterFrom(""); setFilterTo(""); }} />
      )}

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

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} aria-hidden="true" className="animate-spin text-[var(--color-muted-fg)]" />
        </div>
      ) : tab === "compose" ? (
        <form onSubmit={sendMail} className="space-y-4 rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]">
          <div>
            <label className={labelCls} htmlFor="to">
              To (staff)
            </label>
            <div className="flex flex-wrap gap-2">
              {recipients.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-fg)]">No staff available. Please try again later.</p>
              ) : (
                recipients.map((r) => {
                  const selected = to.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleRecipient(r.id)}
                      className={`focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        selected
                          ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]"
                          : "border-[var(--color-border)] bg-white text-[var(--color-muted-fg)] hover:bg-slate-50"
                      }`}
                    >
                      {initials(r.full_name)} {r.full_name}
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="subject">
              Subject
            </label>
            <input id="subject" className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div>
            <label className={labelCls} htmlFor="body">
              Message
            </label>
            <textarea id="body" rows={6} className={inputCls} value={body} onChange={(e) => setBody(e.target.value)} required />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={sending}
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
            >
              <Send size={15} /> {sending ? "Sending…" : "Send message"}
            </button>
          </div>
        </form>
      ) : tab === "inbox" ? (
        visibleInbox.length === 0 ? (
          emptyCard("Your inbox is empty.")
        ) : (
          <div className="space-y-3">
            {visibleInbox.map((msg) => {
              const open = openId === msg.id;
              return (
                <div key={msg.id} className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
                  <div className="flex items-center gap-2 px-4 py-3.5">
                    <button type="button" onClick={() => toggleOpen(msg.id, msg)} className="focus-ring flex w-full items-center justify-between gap-3 text-left">
                      <div className="flex min-w-0 items-center gap-3">
                        {!msg.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-primary)]" aria-hidden="true" />}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">{msg.subject}</p>
                          <p className="text-xs text-[var(--color-muted-fg)]">
                            {msg.sender?.full_name ?? "Hospital"} · {timeAgo(msg.created_at)}
                            {msg.is_broadcast ? " · Broadcast" : ""}
                          </p>
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMessage(msg)}
                      className="focus-ring shrink-0 rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-rose-50 hover:text-[var(--color-destructive)]"
                      aria-label="Delete message"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {open && (
                    <div className="border-t border-[var(--color-border)] bg-slate-50/60 px-4 py-4">
                      <p className="whitespace-pre-wrap text-sm text-[var(--color-foreground)]">{msg.body}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : visibleSent.length === 0 ? (
        emptyCard("You haven't sent any messages yet.")
      ) : (
        <div className="space-y-3">
          {visibleSent.map((msg) => {
            const open = openId === msg.id;
            return (
              <div key={msg.id} className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
                <div className="flex items-center gap-2 px-4 py-3.5">
                  <button type="button" onClick={() => toggleOpen(msg.id, msg)} className="focus-ring flex w-full items-center justify-between gap-3 text-left">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">{msg.subject}</p>
                      <p className="text-xs text-[var(--color-muted-fg)]">
                        To: {(msg.recipients ?? []).map((r) => r.full_name).join(", ") || "Hospital staff"} · {timeAgo(msg.created_at)}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeMessage(msg)}
                    className="focus-ring shrink-0 rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-rose-50 hover:text-[var(--color-destructive)]"
                    aria-label="Delete message"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {open && (
                  <div className="border-t border-[var(--color-border)] bg-slate-50/60 px-4 py-4">
                    <p className="whitespace-pre-wrap text-sm text-[var(--color-foreground)]">{msg.body}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}