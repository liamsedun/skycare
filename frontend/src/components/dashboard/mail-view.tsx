"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Loader2, MailPlus, Paperclip, Search, Send, Trash2 } from "lucide-react";
import { initials, ROLE_LABELS } from "@/lib/auth";
import type { AppRole } from "@/lib/auth";
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
  broadcast_scope: string;
  created_at: string;
  attachments?: string[];
  isRead?: boolean;
  sender?: { id: string; full_name: string; email: string; role: AppRole } | null;
  recipients?: Array<{ id: string; full_name: string; email: string }>;
}

interface RecipientOption {
  id: string;
  full_name: string;
  email: string;
  role: AppRole;
  has_account?: boolean;
  delivered_via?: string | null;
  no_path?: boolean;
}

interface RecipientGroups {
  staff: RecipientOption[];
  patients: RecipientOption[];
}

type Tab = "inbox" | "sent" | "compose";

const recipientLabel = (r: RecipientOption) =>
  r.no_path
    ? `${r.full_name} (no portal account — cannot receive mail)`
    : `${r.full_name}${r.has_account === false && r.delivered_via ? ` (via ${r.delivered_via})` : ""}`;

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
  const [recipients, setRecipients] = useState<RecipientGroups>({ staff: [], patients: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const [to, setTo] = useState<string[]>([]);
  const [toSearch, setToSearch] = useState("");
  const [broadcast, setBroadcast] = useState(false);
  const [broadcastPatients, setBroadcastPatients] = useState(false);
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
        setRecipients({ staff: b.data?.staff ?? [], patients: b.data?.patients ?? [] });
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

  const searchResults = useMemo(() => {
    const q = toSearch.trim().toLowerCase();
    if (!q) return [];
    return [...recipients.staff, ...recipients.patients]
      .filter((r) => !to.includes(r.id) && !r.no_path)
      .filter((r) => `${r.full_name} ${r.email} ${ROLE_LABELS[r.role] ?? r.role}`.toLowerCase().includes(q))
      .slice(0, 20);
  }, [toSearch, recipients, to]);

  function addRecipient(id: string) {
    if (!to.includes(id)) setTo((t) => [...t, id]);
    setToSearch("");
  }

  async function markRead(rowId: string) {
    await fetch(`/api/mail/${rowId}/read`, { method: "PUT" }).catch(() => {});
    setInbox((rows) => rows.map((r) => (r.recipientRowId === rowId ? { ...r, isRead: true } : r)));
  }

  function openMessage(msg: MailMessage) {
    if (openId === msg.id) {
      setOpenId(null);
      return;
    }
    setOpenId(msg.id);
    if (msg.recipientRowId && !msg.isRead) markRead(msg.recipientRowId);
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

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    setSentOk(false);
    try {
      const isBroadcast = broadcast || broadcastPatients;
      const scope = broadcast && broadcastPatients ? "all" : broadcast ? "staff" : broadcastPatients ? "patients" : "staff";
      const res = await fetch("/api/mail/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isBroadcast ? { subject, body, broadcast: true, broadcastScope: scope } : { recipientIds: to, subject, body }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "Failed to send");
      setTo([]);
      setSubject("");
      setBody("");
      setBroadcast(false);
      setBroadcastPatients(false);
      setSentOk(true);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  const inboxUnread = useMemo(() => inbox.filter((m) => !m.isRead).length, [inbox]);

  const visibleInbox = useMemo(
    () => inbox.filter((m) => inDateRange(m.created_at, filterFrom, filterTo)),
    [inbox, filterFrom, filterTo]
  );
  const visibleSent = useMemo(
    () => sent.filter((m) => inDateRange(m.created_at, filterFrom, filterTo)),
    [sent, filterFrom, filterTo]
  );

  const tabs: Array<{ key: Tab; label: string; icon: typeof Inbox }> = [
    { key: "inbox", label: "Inbox", icon: Inbox },
    { key: "sent", label: "Sent", icon: Send },
    { key: "compose", label: "Compose", icon: MailPlus },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Internal mail</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Messaging between hospital staff.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 gap-1 rounded-lg border border-[var(--color-border)] bg-white p-1 shadow-[var(--shadow-sm)]">
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
        <DateRangeBar
          from={filterFrom}
          to={filterTo}
          onFromChange={setFilterFrom}
          onToChange={setFilterTo}
          onClear={() => { setFilterFrom(""); setFilterTo(""); }}
        />
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
            <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] p-3">
              <input
                type="checkbox"
                checked={broadcast}
                onChange={(e) => { setBroadcast(e.target.checked); if (e.target.checked) setToSearch(""); }}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              <span className="text-sm">
                <span className="font-medium text-[var(--color-foreground)]">Broadcast to all staff</span>
                <span className="block text-xs text-[var(--color-muted-fg)]">Every staff member in this hospital receives the message.</span>
              </span>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] p-3">
              <input
                type="checkbox"
                checked={broadcastPatients}
                onChange={(e) => { setBroadcastPatients(e.target.checked); if (e.target.checked) setToSearch(""); }}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              <span className="text-sm">
                <span className="font-medium text-[var(--color-foreground)]">Broadcast to all patients</span>
                <span className="block text-xs text-[var(--color-muted-fg)]">Every patient (and their dependants with portal access) receives the message.</span>
              </span>
            </label>
            </div>

            {!broadcast && !broadcastPatients && (
              <div>
                <label className={labelCls} htmlFor="mail-to">To *</label>
                <div className="relative">
                  <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
                  <input
                    id="mail-to"
                    value={toSearch}
                    onChange={(e) => setToSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && searchResults.length > 0) {
                        e.preventDefault();
                        addRecipient(searchResults[0].id);
                      }
                    }}
                    placeholder="Search staff or patients by name, email or role…"
                    className="w-full rounded-lg border border-[var(--color-border)] bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]"
                  />
                  {toSearch.trim().length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-[var(--color-border)] bg-white shadow-lg">
                      {searchResults.length === 0 ? (
                        <p className="px-3 py-2.5 text-sm text-[var(--color-muted-fg)]">No matches for “{toSearch.trim()}”.</p>
                      ) : (
                        searchResults.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => addRecipient(r.id)}
                            className="focus-ring flex w-full items-center gap-2 border-b border-[var(--color-border)]/60 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--color-muted)]"
                          >
                            <span className="shrink-0 rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted-fg)]">
                              {r.role === "patient_api" ? "Patient" : "Staff"}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-medium text-[var(--color-foreground)]">{recipientLabel(r)}</span>
                            <span className="shrink-0 text-xs text-[var(--color-muted-fg)]">{ROLE_LABELS[r.role] ?? r.role}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white p-2">
                  {to.map((id) => {
                    const opt = [...recipients.staff, ...recipients.patients].find((r) => r.id === id);
                    return (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-soft)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary-dark)]">
                        {opt ? recipientLabel(opt) : "?"}
                        <button type="button" onClick={() => setTo((t) => t.filter((x) => x !== id))} className="hover:text-[var(--color-destructive)]" aria-label={`Remove ${opt?.full_name ?? ""}`}>×</button>
                      </span>
                    );
                  })}
                  <select
                    aria-label="Add recipient"
                    value=""
                    onChange={(e) => {
                      if (e.target.value && !to.includes(e.target.value)) setTo((t) => [...t, e.target.value]);
                    }}
                    className="min-w-32 flex-1 bg-transparent px-1 py-1 text-sm outline-none"
                  >
                    <option value="">Or pick from the list…</option>
                    {recipients.staff.length > 0 && (
                      <optgroup label="Staff">
                        {recipients.staff.map((r) => (
                          <option key={r.id} value={r.id} disabled={to.includes(r.id)}>
                            {r.full_name} ({ROLE_LABELS[r.role] ?? r.role})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {recipients.patients.length > 0 && (
                      <optgroup label="Patients & dependants">
                        {recipients.patients.map((r) => (
                          <option key={r.id} value={r.id} disabled={to.includes(r.id) || r.no_path} title={r.no_path ? "No portal account — mail cannot be delivered" : undefined}>
                            {recipientLabel(r)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
                <p className="mt-1 text-xs text-[var(--color-muted-fg)]">Tip: type in the search bar to find staff or patients quickly — or use the dropdown.</p>
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
              disabled={sending || (!broadcast && !broadcastPatients && to.length === 0)}
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
            {(tab === "inbox" ? visibleInbox : visibleSent).length === 0 && (
              <li className="px-4 py-12 text-center text-sm text-[var(--color-muted-fg)]">
                {(tab === "inbox" ? inbox : sent).length === 0
                  ? tab === "inbox" ? "No messages yet." : "Nothing sent yet."
                  : "No messages match the current date range."}
              </li>
            )}
            {(tab === "inbox" ? visibleInbox : visibleSent).map((m) => {
              const open = openId === m.id;
              const person = tab === "inbox" ? m.sender : null;
              return (
                <li key={m.id}>
                  <div className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 ${open ? "bg-[var(--color-muted)]/40" : ""}`}>
                    <button
                      type="button"
                      onClick={() => openMessage(m)}
                      className="focus-ring flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${m.isRead ? "bg-slate-300" : "bg-[var(--color-primary)]"}`}>
                        {initials(tab === "inbox" ? (person?.full_name ?? "?") : "Me")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-sm ${m.isRead ? "font-medium text-[var(--color-foreground)]" : "font-bold text-[var(--color-foreground)]"}`}>
                            {m.subject}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-xs text-[var(--color-muted-fg)]">{timeAgo(m.created_at)}</span>
                            {tab === "sent" && (
                              <span className={`text-xs text-[var(--color-muted-fg)] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">▾</span>
                            )}
                          </span>
                        </span>
                        <span className="block truncate text-xs text-[var(--color-muted-fg)]">
                          {tab === "inbox" ? (person?.full_name ?? "Unknown") + (m.is_broadcast ? " · Broadcast" : "") : `${m.recipients?.length ?? 0} recipient(s)`}
                          {!m.isRead && tab === "inbox" ? " · Unread" : ""}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMessage(m)}
                      className="focus-ring shrink-0 rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-rose-50 hover:text-[var(--color-destructive)]"
                      aria-label="Delete message"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {open && (
                    <div className="border-t border-[var(--color-border)] bg-[var(--color-muted)]/20 px-4 py-4">
                      <div className="whitespace-pre-wrap text-sm text-[var(--color-foreground)]">{m.body}</div>
                      {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {m.attachments.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-muted)]/40"
                            >
                              <Paperclip size={13} /> Attachment {i + 1}
                            </a>
                          ))}
                        </div>
                      )}
                      {tab === "sent" && (
                        <p className="mt-3 text-xs text-[var(--color-muted-fg)]">
                          {m.is_broadcast && m.broadcast_scope === "patients"
                            ? `Broadcast to all patients · ${m.recipients?.length ?? 0} recipient(s)`
                            : m.is_broadcast && m.broadcast_scope === "all"
                            ? `Broadcast to all staff & patients · ${m.recipients?.length ?? 0} recipient(s)`
                            : m.is_broadcast
                            ? `Broadcast to all staff · ${m.recipients?.length ?? 0} recipient(s)`
                            : `To: ${m.recipients?.map((r) => r.full_name || r.email).join(", ") ?? ""}`}
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