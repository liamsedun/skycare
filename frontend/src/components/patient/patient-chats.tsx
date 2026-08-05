"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Plus, Send } from "lucide-react";
import { initials } from "@/lib/auth";

interface OtherUser {
  id: string;
  full_name: string;
  role?: string;
  avatar_url: string | null;
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
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
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

export default function PatientChats() {
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
  const myUserId = useRef<string>("");

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
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => {
        if (b.data?.user?.id) myUserId.current = b.data.user.id;
      })
      .catch(() => {});
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
      setMessages(body.data?.messages ?? []);
      setChats((rows) => rows.map((c) => (c.id === chatId ? { ...c, unread_count: 0 } : c)));
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

  function openChat(chat: ChatItem) {
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
        body: JSON.stringify({ staffUserId: entry.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to start chat");
      const chat: ChatItem = {
        id: body.data.chat.id,
        patient_id: "",
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
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-foreground)]">Messages</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Chat with hospital staff.</p>
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
                  <p className="px-2 py-3 text-xs text-[var(--color-muted-fg)]">No staff available yet.</p>
                ) : (
                  directory.map((d) => {
                    const existing = chats.find((c) => c.other_user?.id === d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        disabled={creating || !!existing}
                        onClick={() => startChat(d)}
                        className="focus-ring flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-white disabled:opacity-60"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                          {initials(d.full_name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-[var(--color-foreground)]">{d.full_name}</span>
                          <span className="block truncate text-xs text-[var(--color-muted-fg)]">{d.role?.replace(/_/g, " ")}</span>
                        </span>
                        {existing ? <span className="text-xs text-[var(--color-muted-fg)]">Open</span> : null}
                      </button>
                    );
                  })
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {chats.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <MessageCircle size={28} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
                  <p className="mt-2 text-sm text-[var(--color-muted-fg)]">No conversations yet. Start one with your doctor or the front desk.</p>
                </div>
              ) : (
                chats.map((chat) => {
                  const isOnline = online.has(chat.other_user?.id ?? "");
                  const isActive = active?.id === chat.id;
                  return (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => openChat(chat)}
                      className={`focus-ring flex w-full items-start gap-2.5 border-b border-[var(--color-border)] px-3 py-3 text-left transition-colors ${isActive ? "bg-[var(--color-primary-soft)]" : "hover:bg-slate-50"}`}
                    >
                      <div className="relative shrink-0">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                          {initials(chat.other_user?.full_name ?? "Staff")}
                        </span>
                        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${isOnline ? "bg-emerald-500" : "bg-slate-300"}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">{chat.other_user?.full_name ?? "Staff"}</p>
                          <span className="shrink-0 text-[10px] text-[var(--color-muted-fg)]">{timeAgo(chat.last_message_at)}</span>
                        </div>
                        <p className="truncate text-xs text-[var(--color-muted-fg)]">{chat.last_message ?? "No messages yet"}</p>
                      </div>
                      {chat.unread_count > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] px-1.5 text-[10px] font-bold text-white">
                          {chat.unread_count}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex max-h-[65vh] flex-col">
            {!active ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
                <MessageCircle size={32} aria-hidden="true" className="text-[var(--color-muted-fg)]" />
                <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">Select a conversation</p>
                <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Your messages with hospital staff will appear here.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                    {initials(active.other_user?.full_name ?? "Staff")}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-foreground)]">{active.other_user?.full_name ?? "Staff"}</p>
                    <p className="text-xs text-[var(--color-muted-fg)]">
                      {active.other_user?.role?.replace(/_/g, " ") ?? "Hospital staff"}
                    </p>
                  </div>
                </div>

                <div className="flex-1 space-y-2.5 overflow-y-auto bg-slate-50/50 px-4 py-4">
                  {messages.map((m) => {
                    const mine = m.sender_id === myUserId.current;
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                            mine
                              ? "bg-[var(--color-primary)] text-white"
                              : "border border-[var(--color-border)] bg-white text-[var(--color-foreground)]"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.message}</p>
                          <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-[var(--color-muted-fg)]"}`}>{clock(m.created_at)}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                <form onSubmit={send} className="flex items-center gap-2 border-t border-[var(--color-border)] px-3 py-2.5">
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type a message…"
                    className="flex-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
                    aria-label="Message"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
                    aria-label="Send"
                  >
                    <Send size={16} />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}