"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Plus, Send } from "lucide-react";
import { initials } from "@/lib/auth";

interface OtherUser {
  id: string;
  full_name: string;
  patient_number: string | null;
  avatar_url: string | null;
  is_dependant: boolean;
}

interface ChatItem {
  id: string;
  patient_id: string;
  last_message: string | null;
  last_sender_id: string | null;
  last_message_at: string | null;
  unread_count: number;
  other_user: OtherUser | null;
}

interface DirectoryEntry {
  patient_id: string;
  user_id: string;
  full_name: string;
  patient_number: string | null;
  avatar_url: string | null;
  is_dependant: boolean;
}

interface Message {
  id: string;
  sender_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatView() {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<ChatItem | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentUserId = useRef<string>("");

  const loadList = useCallback(async () => {
    try {
      const res = await fetch("/api/chats", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load chats");
      setChats(body.data?.chats ?? []);
      setDirectory(body.data?.directory ?? []);
      setOnline(new Set(body.data?.online ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Presence heartbeat + chat list refresh
  useEffect(() => {
    const beat = setInterval(() => {
      fetch("/api/chat-presence", { method: "POST" }).catch(() => {});
      loadList();
    }, 30000);
    fetch("/api/chat-presence", { method: "POST" }).catch(() => {});
    return () => clearInterval(beat);
  }, [loadList]);

  const loadMessages = useCallback(async (chatId: string) => {
    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load messages");
      currentUserId.current = body.data?.chat?.staff_user_id ?? "";
      setMessages(body.data?.messages ?? []);
      setChats((rows) =>
        rows.map((c) => (c.id === chatId ? { ...c, unread_count: 0 } : c))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load messages");
    }
  }, []);

  useEffect(() => {
    if (active) {
      loadMessages(active.id);
      const t = setInterval(() => loadMessages(active.id), 5000);
      return () => clearInterval(t);
    }
  }, [active, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function openChat(chat: ChatItem) {
    setActive(chat);
    setShowNew(false);
  }

  async function startChat(entry: DirectoryEntry) {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: entry.patient_id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to start chat");
      const chat: ChatItem = {
        id: body.data.chat.id,
        patient_id: entry.patient_id,
        last_message: null,
        last_sender_id: null,
        last_message_at: null,
        unread_count: 0,
        other_user: body.data.other_user,
      };
      await loadList();
      setActive(chat);
      setShowNew(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start chat");
    } finally {
      setCreating(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!active || !draft.trim()) return;
    const text = draft.trim();
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/chats/${active.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to send");
      setDraft("");
      await loadMessages(active.id);
      await loadList();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-foreground)]">Chats</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Messaging with patients who use the portal.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} aria-hidden="true" className="animate-spin text-[var(--color-muted-fg)]" />
        </div>
      ) : (
        <div className="grid overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)] md:grid-cols-[280px_1fr]">
          <div className="flex max-h-[65vh] flex-col border-b border-[var(--color-border)] md:border-b-0 md:border-r">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2.5">
              <p className="text-sm font-semibold text-[var(--color-foreground)]">Conversations</p>
              <button
                type="button"
                onClick={() => setShowNew((s) => !s)}
                className="focus-ring inline-flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-primary-dark)]"
              >
                <Plus size={13} aria-hidden="true" /> New
              </button>
            </div>

            {showNew && (
              <div className="max-h-48 overflow-y-auto border-b border-[var(--color-border)] bg-slate-50 p-2">
                {directory.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-[var(--color-muted-fg)]">No patients with portal accounts yet.</p>
                ) : (
                  directory.map((d) => {
                    const existing = chats.find((c) => c.patient_id === d.patient_id);
                    return (
                      <button
                        key={d.patient_id}
                        type="button"
                        disabled={creating}
                        onClick={() => startChat(d)}
                        className="focus-ring flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-white disabled:opacity-60"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                          {initials(d.full_name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-[var(--color-foreground)]">{d.full_name}</span>
                          <span className="block truncate text-xs text-[var(--color-muted-fg)]">
                            {d.patient_number} {d.is_dependant ? "· Dependant" : ""}
                          </span>
                        </span>
                        {existing && <span className="text-[10px] text-[var(--color-muted-fg)]">open</span>}
                      </button>
                    );
                  })
                )}
              </div>
            )}

            <ul className="flex-1 overflow-y-auto">
              {chats.length === 0 && (
                <li className="px-4 py-10 text-center text-sm text-[var(--color-muted-fg)]">
                  No conversations yet. Start one with a patient.
                </li>
              )}
              {chats.map((c) => {
                const u = c.other_user;
                const isOnline = u ? online.has(u.id) : false;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => openChat(c)}
                      className={`focus-ring flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-slate-50 ${
                        active?.id === c.id ? "bg-[var(--color-primary-soft)]" : ""
                      }`}
                    >
                      <span className="relative shrink-0">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">
                          {initials(u?.full_name ?? "?")}
                        </span>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${isOnline ? "bg-emerald-500" : "bg-slate-300"}`}
                          aria-hidden="true"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium text-[var(--color-foreground)]">{u?.full_name ?? "Patient"}</span>
                          <span className="shrink-0 text-[10px] text-[var(--color-muted-fg)]">{timeAgo(c.last_message_at)}</span>
                        </span>
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-xs text-[var(--color-muted-fg)]">{c.last_message ?? "No messages yet"}</span>
                          {c.unread_count > 0 && (
                            <span className="shrink-0 rounded-full bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {c.unread_count}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {active ? (
            <div className="flex max-h-[65vh] flex-col">
              <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">
                  {initials(active.other_user?.full_name ?? "?")}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">{active.other_user?.full_name ?? "Patient"}</p>
                  <p className="truncate text-xs text-[var(--color-muted-fg)]">{active.other_user?.patient_number ?? ""}</p>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
                {messages.length === 0 && (
                  <p className="pt-10 text-center text-sm text-[var(--color-muted-fg)]">Say hello to start the conversation.</p>
                )}
                {messages.map((m) => {
                  const mine = m.sender_id === currentUserId.current;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                          mine
                            ? "rounded-br-sm bg-[var(--color-primary)] text-white"
                            : "rounded-bl-sm bg-white text-[var(--color-foreground)]"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.message}</p>
                        <p className={`mt-1 text-right text-[10px] ${mine ? "text-white/70" : "text-[var(--color-muted-fg)]"}`}>{clock(m.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={send} className="flex items-center gap-2 border-t border-[var(--color-border)] p-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a message…"
                  className="focus-ring w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
                  aria-label="Send message"
                >
                  <Send size={16} aria-hidden="true" />
                </button>
              </form>
            </div>
          ) : (
            <div className="flex max-h-[65vh] flex-col items-center justify-center gap-3 bg-slate-50/60 p-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-[var(--color-muted-fg)] shadow-sm">
                <MessageCircle size={24} aria-hidden="true" />
              </span>
              <p className="text-sm font-medium text-[var(--color-foreground)]">Select a conversation</p>
              <p className="max-w-xs text-xs text-[var(--color-muted-fg)]">
                Messages sent here appear in the patient&apos;s portal and can be answered from either side.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}