"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, RefreshCw, Eye, MessageSquare, User as UserIcon,
  Building2, Flag, Clock, Search, Filter, Loader2,
} from "lucide-react";
import { PlatformGlassCard, PlatformPageHeader, StatusChip, PlatformEmpty, PlatformSheet } from "@/components/platform/platform-mobile-ui";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  closed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};
const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  normal: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};
const CATEGORY_LABELS: Record<string, string> = {
  general: "General", billing: "Billing", technical: "Technical",
  feature_request: "Feature Request", bug: "Bug Report",
};

interface Ticket {
  id: string; subject: string; message: string; category: string; priority: string;
  status: string; assigned_to: string | null; resolution: string | null;
  closed_at: string | null; created_at: string; updated_at: string;
  user_id: string; tenant_id: string;
  tenant?: { name: string } | null;
}

interface TicketMessage {
  id: string; ticket_id: string; user_id: string; message: string;
  is_internal: boolean; created_at: string;
}

export default function SupportTicketsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"list" | "detail">("list");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ subject: "", message: "", category: "general", priority: "normal" });
  const [submitting, setSubmitting] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyInternal, setReplyInternal] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (filterStatus) sp.set("status", filterStatus);
      if (filterPriority) sp.set("priority", filterPriority);
      sp.set("pageSize", "100");
      const res = await fetch(`/api/platform/support?${sp}`, { credentials: "include" });
      const j = await res.json();
      setTickets(j.data?.rows || []);
    } catch { setTickets([]); }
    setLoading(false);
  };

  useEffect(() => { loadTickets(); }, [filterStatus, filterPriority]);

  const loadTicket = async (id: string) => {
    const res = await fetch(`/api/platform/support/${id}`, { credentials: "include" });
    const j = await res.json();
    setSelectedTicket(j.data);
    setMessages(j.data?.messages || []);
    setTab("detail");
  };

  const createTicket = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/platform/support", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setShowCreate(false);
      setForm({ subject: "", message: "", category: "general", priority: "normal" });
      loadTickets();
    } catch {}
    setSubmitting(false);
  };

  const sendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    setSendingReply(true);
    try {
      await fetch(`/api/platform/support/${selectedTicket.id}/messages`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyText, is_internal: replyInternal }),
      });
      setReplyText("");
      setReplyInternal(false);
      loadTicket(selectedTicket.id);
    } catch {}
    setSendingReply(false);
  };

  const updateStatus = async (status: string) => {
    if (!selectedTicket) return;
    await fetch(`/api/platform/support/${selectedTicket.id}`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadTicket(selectedTicket.id);
    if (tab === "list") loadTickets();
  };

  const filtered = tickets.filter(t =>
    !search || t.subject.toLowerCase().includes(search.toLowerCase()) ||
    t.message.toLowerCase().includes(search.toLowerCase())
  );

  const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  if (tab === "detail" && selectedTicket) {
    return (
      <div className="space-y-6 platform-stagger">
        <div className="flex items-center gap-3">
          <button onClick={() => setTab("list")} className="flex items-center gap-1 text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-foreground)]">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="text-lg font-semibold">{selectedTicket.subject}</h1>
          <StatusChip status={selectedTicket.status} />
          <StatusChip status={selectedTicket.priority} />
        </div>

        <PlatformGlassCard>
          <div className="flex items-center gap-4 text-sm text-[var(--color-muted-fg)]">
            <span className="flex items-center gap-1"><UserIcon className="h-3.5 w-3.5" /> User: {selectedTicket.user_id.slice(0, 8)}…</span>
            <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {selectedTicket.tenant?.name || "Unknown"}</span>
            <span className="flex items-center gap-1"><Flag className="h-3.5 w-3.5" /> {CATEGORY_LABELS[selectedTicket.category] || selectedTicket.category}</span>
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {fmtDate(selectedTicket.created_at)}</span>
          </div>
          <p className="text-sm whitespace-pre-wrap">{selectedTicket.message}</p>
          {selectedTicket.resolution && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-3 text-sm text-emerald-700 dark:text-emerald-400">
              <strong>Resolution:</strong> {selectedTicket.resolution}
            </div>
          )}
        </PlatformGlassCard>

        <div className="flex items-center gap-2">
          {selectedTicket.status === "open" && (
            <button onClick={() => updateStatus("in_progress")} className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm text-white hover:bg-amber-600 platform-btn-gradient">Start Progress</button>
          )}
          {selectedTicket.status === "in_progress" && (
            <button onClick={() => updateStatus("resolved")} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm text-white hover:bg-emerald-600 platform-btn-gradient">Mark Resolved</button>
          )}
          {selectedTicket.status === "resolved" && (
            <button onClick={() => updateStatus("closed")} className="rounded-lg bg-gray-600 px-3 py-1.5 text-sm text-white hover:bg-gray-700">Close Ticket</button>
          )}
          {(selectedTicket.status === "open" || selectedTicket.status === "in_progress") && (
            <button onClick={() => updateStatus("closed")} className="rounded-lg bg-red-500 px-3 py-1.5 text-sm text-white hover:bg-red-600">Close Without Resolution</button>
          )}
        </div>

        <PlatformGlassCard>
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Messages ({messages.length})
          </h3>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {messages.length === 0 && <p className="text-sm text-[var(--color-muted-fg)]">No messages yet</p>}
            {messages.map(m => (
              <div key={m.id} className={`rounded-lg p-3 text-sm ${m.is_internal ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800" : "bg-[var(--color-muted)]/30"}`}>
                <div className="flex items-center gap-2 mb-1 text-xs text-[var(--color-muted-fg)]">
                  <span>{m.user_id.slice(0, 8)}…</span>
                  <span>{fmtDate(m.created_at)}</span>
                  {m.is_internal && <span className="rounded bg-amber-200 dark:bg-amber-800 px-1 py-0.5 text-amber-700 dark:text-amber-300 text-[10px]">Internal</span>}
                </div>
                <p className="whitespace-pre-wrap">{m.message}</p>
              </div>
            ))}
          </div>
        </PlatformGlassCard>

        <PlatformGlassCard>
          <textarea
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm min-h-[80px] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
            placeholder="Write a reply…"
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-[var(--color-muted-fg)] cursor-pointer">
              <input type="checkbox" checked={replyInternal} onChange={e => setReplyInternal(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-amber-500" />
              Internal note
            </label>
            <button onClick={sendReply} disabled={!replyText.trim() || sendingReply}
              className="flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm text-white hover:bg-sky-600 disabled:opacity-50 platform-btn-gradient">
              {sendingReply && <Loader2 className="h-4 w-4 animate-spin" />} Send
            </button>
          </div>
        </PlatformGlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-6 platform-stagger">
      <PlatformPageHeader title="Support Tickets" subtitle="Manage tenant support requests">
        <button onClick={loadTickets} className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-muted)]">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 rounded-lg bg-sky-500 px-3 py-2 text-sm text-white hover:bg-sky-600 platform-btn-gradient">
          <Plus className="h-4 w-4" /> New Ticket
        </button>
      </PlatformPageHeader>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-muted-fg)]" />
          <input className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] pl-9 pr-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
            placeholder="Search tickets…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
          value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
          value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="">All Priorities</option>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-[var(--color-muted-fg)]">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading tickets…
        </div>
      ) : filtered.length === 0 ? (
        <PlatformEmpty
          icon={<MessageSquare className="h-6 w-6" />}
          title="No tickets found"
          hint="Support tickets from tenants will appear here"
        />
      ) : (
        <PlatformGlassCard className="!p-0 overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/30 text-left">
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Tenant</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-muted)]/20 platform-table-row">
                  <td className="px-4 py-3 font-medium">{t.subject}</td>
                  <td className="px-4 py-3 text-[var(--color-muted-fg)]">{t.tenant?.name || "—"}</td>
                  <td className="px-4 py-3 text-[var(--color-muted-fg)]">{CATEGORY_LABELS[t.category] || t.category}</td>
                  <td className="px-4 py-3"><StatusChip status={t.status} /></td>
                  <td className="px-4 py-3"><StatusChip status={t.priority} /></td>
                  <td className="px-4 py-3 text-[var(--color-muted-fg)] text-xs">{fmtDate(t.created_at)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => loadTicket(t.id)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20">
                      <Eye className="h-3.5 w-3.5" /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PlatformGlassCard>
      )}

      <PlatformSheet open={showCreate} onClose={() => setShowCreate(false)} title="New Support Ticket">
        <div className="space-y-3">
          <input className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
            placeholder="Subject" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
          <select className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
            value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            <option value="general">General</option>
            <option value="billing">Billing</option>
            <option value="technical">Technical</option>
            <option value="feature_request">Feature Request</option>
            <option value="bug">Bug Report</option>
          </select>
          <select className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
            value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <textarea className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm min-h-[100px] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
            placeholder="Describe the issue…" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setShowCreate(false)} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-muted)]">Cancel</button>
          <button onClick={createTicket} disabled={!form.subject || !form.message || submitting}
            className="flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm text-white hover:bg-sky-600 disabled:opacity-50 platform-btn-gradient">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Create
          </button>
        </div>
      </PlatformSheet>
    </div>
  );
}
