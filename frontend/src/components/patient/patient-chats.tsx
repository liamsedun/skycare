"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCheck,
  ChevronLeft,
  Loader2,
  MessageCircle,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Video,
} from "lucide-react";
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

type TabKey = "all" | "staff" | "patient" | "urgent";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "patient", label: "Patients" },
  { key: "staff", label: "Staff" },
  { key: "urgent", label: "Urgent" },
];

const QUICK_REPLIES = ["Thank you", "I need help", "Please call me", "I'll wait"];

const NAVY = "#12293B";
const TEAL = "#2F6F6A";

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

function Avatar({
  name,
  color,
  online,
  size = 44,
}: {
  name: string;
  color: string;
  online?: boolean;
  size?: number;
}) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <span
        className="flex items-center justify-center font-semibold text-white"
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, fontSize: size * 0.36 }}
      >
        {initials(name)}
      </span>
      {online && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-[#F5F7F6]"
          style={{ width: Math.max(10, size * 0.25), height: Math.max(10, size * 0.25), backgroundColor: "#3E8E7E" }}
          aria-hidden="true"
        />
      )}
    </span>
  );
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
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
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

  async function sendText(text: string) {
    if (!active || !text.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/chats/${active.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim() }),
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

  async function send(e: React.FormEvent) {
    e.preventDefault();
    await sendText(draft);
  }

  const filtered = chats.filter((c) => {
    const name = c.other_user?.full_name ?? "";
    const matchesTab =
      activeTab === "all"
        ? true
        : activeTab === "urgent"
          ? c.unread_count > 0
          : activeTab === "staff"
            ? true
            : false;
    const matchesQuery = name.toLowerCase().includes(query.toLowerCase());
    return matchesTab && matchesQuery;
  });

  const activeOnline = active ? online.has(active.other_user?.id ?? "") : false;

  return (
    <div className="space-y-4">
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
        <div className="flex h-[72vh] min-h-[480px] flex-col overflow-hidden rounded-2xl border border-[#E3E9E7] bg-[#F5F7F6] shadow-lg">
          {/* Header */}
          <div style={{ backgroundColor: NAVY }} className="px-5 pb-4 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold tracking-[1.5px] text-[#7FA9A1]">SECURE MESSAGING</p>
                <h1 className="mt-0.5 text-2xl font-bold text-white">Messages</h1>
              </div>
              <button
                type="button"
                onClick={() => setShowNew((s) => !s)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="Start a new conversation"
              >
                <Plus size={20} />
              </button>
            </div>
            <div className="mt-3.5 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5">
              <Search size={16} color="#9FBAC2" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search staff"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#9FBAC2]"
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-[#E3E9E7] bg-[#F5F7F6] px-5 py-3">
            {TABS.map((t) => {
              const isActive = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                    isActive
                      ? "border-[#12293B] bg-[#12293B] text-white"
                      : "border-[#E3E9E7] bg-white text-[#5A6B68] hover:border-[#CBD6D3]"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="grid min-h-0 flex-1 md:grid-cols-[320px_1fr]">
            {/* Conversation list */}
            <div
              className={`min-h-0 flex-col border-[#E3E9E7] bg-[#F5F7F6] md:flex md:border-r ${
                active ? "hidden" : "flex"
              }`}
            >
              {showNew && (
                <div className="max-h-48 overflow-y-auto border-b border-[#E3E9E7] bg-white/70 px-2 py-2">
                  {directory.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-[#6B7A77]">No staff available yet.</p>
                  ) : (
                    directory.map((d) => {
                      const existing = chats.find((c) => c.other_user?.id === d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          disabled={creating || !!existing}
                          onClick={() => startChat(d)}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-white disabled:opacity-60"
                        >
                          <Avatar name={d.full_name} color={TEAL} size={34} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-[#16221F]">{d.full_name}</span>
                            <span className="block truncate text-xs text-[#6B7A77]">
                              {d.role?.replace(/_/g, " ") ?? "Hospital staff"}
                            </span>
                          </span>
                          {existing ? <span className="text-xs text-[#6B7A77]">Open</span> : null}
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto">
                {filtered.length === 0 && (
                  <div className="px-4 py-12 text-center">
                    <MessageCircle size={28} className="mx-auto text-[#9FAEAB]" aria-hidden="true" />
                    <p className="mt-2 text-sm text-[#6B7A77]">
                      {chats.length === 0
                        ? "No conversations yet. Start one with your doctor or the front desk."
                        : "No conversations found."}
                    </p>
                  </div>
                )}
                {filtered.map((chat) => {
                  const isOnline = online.has(chat.other_user?.id ?? "");
                  const isActive = active?.id === chat.id;
                  const urgent = chat.unread_count > 0;
                  return (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => openChat(chat)}
                      className={`flex w-full items-center gap-3 border-b border-[#ECEFEE] px-4 py-3.5 text-left transition-colors ${
                        isActive ? "bg-white shadow-sm" : "hover:bg-white/70"
                      }`}
                    >
                      <Avatar name={chat.other_user?.full_name ?? "Staff"} color={TEAL} online={isOnline} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[15px] font-semibold text-[#16221F]">
                            {chat.other_user?.full_name ?? "Staff"}
                          </span>
                          <span className="shrink-0 text-[11px] text-[#8A9895]">{timeAgo(chat.last_message_at)}</span>
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span
                            className={`truncate text-[13px] ${urgent ? "font-medium text-[#C0503A]" : "text-[#6B7A77]"}`}
                          >
                            {urgent ? "⚠ " : ""}
                            {chat.last_message ?? "No messages yet"}
                          </span>
                          {chat.unread_count > 0 && (
                            <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#2F6F6A] px-1 text-[11px] font-bold text-white">
                              {chat.unread_count}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-[#9FAEAB]">
                          {chat.other_user?.role?.replace(/_/g, " ") ?? "Hospital staff"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Thread pane */}
            <div className={`min-h-0 flex-col bg-[#EFF3F1] md:flex ${active ? "flex" : "hidden"}`}>
              {!active ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#6B7A77] shadow-sm">
                    <MessageCircle size={24} aria-hidden="true" />
                  </span>
                  <p className="text-sm font-semibold text-[#16221F]">Select a conversation</p>
                  <p className="max-w-xs text-xs text-[#6B7A77]">
                    Your messages with hospital staff will appear here.
                  </p>
                </div>
              ) : (
                <>
                  {/* Thread header */}
                  <div className="flex items-center gap-1.5 px-3.5 py-3" style={{ backgroundColor: NAVY }}>
                    <button
                      type="button"
                      onClick={() => setActive(null)}
                      className="rounded p-1 text-white transition-colors hover:bg-white/10 md:hidden"
                      aria-label="Back to conversations"
                    >
                      <ChevronLeft size={22} />
                    </button>
                    <Avatar
                      name={active.other_user?.full_name ?? "Staff"}
                      color={TEAL}
                      online={activeOnline}
                      size={38}
                    />
                    <span className="ml-1.5 min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-white">
                        {active.other_user?.full_name ?? "Staff"}
                      </span>
                      <span className="block truncate text-xs text-[#9FBAC2]">
                        {activeOnline ? "Active now" : "Offline"}
                        {active.other_user?.role ? ` · ${active.other_user.role.replace(/_/g, " ")}` : ""}
                      </span>
                    </span>
                    <button type="button" className="rounded p-2 text-white transition-colors hover:bg-white/10" aria-label="Call">
                      <Phone size={18} />
                    </button>
                    <button type="button" className="rounded p-2 text-white transition-colors hover:bg-white/10" aria-label="Video call">
                      <Video size={18} />
                    </button>
                  </div>

                  {/* Messages */}
                  <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
                    {messages.length === 0 && (
                      <p className="pt-10 text-center text-sm text-[#6B7A77]">Say hello to start the conversation.</p>
                    )}
                    {messages.map((m) => {
                      const mine = m.sender_id === myUserId.current;
                      return (
                        <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[80%] px-3.5 py-2 text-sm shadow-sm ${
                              mine
                                ? "rounded-2xl rounded-br-[4px] bg-[#2F6F6A] text-white"
                                : "rounded-2xl rounded-bl-[4px] bg-white text-[#1F2C29]"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{m.message}</p>
                            <span className="mt-1 flex items-center justify-end gap-1 text-[10px]">
                              <span className={mine ? "text-white/70" : "text-[#9FAEAB]"}>{clock(m.created_at)}</span>
                              {mine && <CheckCheck size={12} color="rgba(255,255,255,0.7)" aria-hidden="true" />}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>

                  {/* Quick replies */}
                  <div className="flex max-h-11 gap-2 overflow-x-auto px-4 pb-2">
                    {QUICK_REPLIES.map((q) => (
                      <button
                        key={q}
                        type="button"
                        disabled={sending || !active}
                        onClick={() => sendText(q)}
                        className="shrink-0 rounded-full border border-[#DDE6E3] bg-white px-3 py-1.5 text-xs text-[#3E5A54] transition-colors hover:bg-[#2F6F6A] hover:text-white disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>

                  {/* Composer */}
                  <form onSubmit={send} className="flex items-center gap-2 border-t border-[#E3E9E7] bg-white px-3.5 py-2.5">
                    <button type="button" className="rounded p-2 text-[#6B7A77] transition-colors hover:bg-[#EFF3F1]" aria-label="Attach file">
                      <Paperclip size={19} />
                    </button>
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Write a secure message…"
                      className="flex-1 rounded-full bg-[#F2F5F4] px-4 py-2.5 text-sm text-[#16221F] outline-none transition-colors placeholder:text-[#9FAEAB] focus:ring-2 focus:ring-[#2F6F6A]/30"
                      aria-label="Message"
                    />
                    <button
                      type="submit"
                      disabled={sending || !draft.trim()}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2F6F6A] text-white transition-colors hover:bg-[#275E5A] disabled:opacity-50"
                      aria-label="Send message"
                    >
                      <Send size={16} aria-hidden="true" />
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
