"use client";

import { useEffect, useState } from "react";
import {
  Search, Filter, ChevronLeft, ChevronRight, Calendar,
  User, Building2, Loader2,
} from "lucide-react";
import { PlatformPageHeader, PlatformGlassCard } from "@/components/platform/platform-mobile-ui";

interface AuditEntry {
  id: string; action: string; entity_type: string; entity_id: string;
  user_id: string; user_email: string; description: string;
  old_value: unknown; new_value: unknown;
  ip_address: string; user_agent: string; created_at: string;
}

const ACTION_STYLES: Record<string, string> = {
  CREATE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  UPDATE: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  LOGIN: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

function fmtDT(s: string) {
  return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AuditPage() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);
  const [showFilter, setShowFilter] = useState(false);

  const pageSize = 30;

  async function load() {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) sp.set("search", search);
      if (action) sp.set("action", action);
      const res = await fetch(`/api/platform/audit?${sp}`, { credentials: "include" });
      const d = await res.json();
      setRows(d.data?.rows || []);
      setTotal(d.data?.total || 0);
      setTotalPages(d.data?.totalPages || 1);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [page, action]);

  function handleSearch() { setPage(1); load(); }

  return (
    <div className="space-y-6 platform-stagger">
      <PlatformPageHeader title="Platform Audit Log" subtitle="Track all platform admin actions" />

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-fg)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search description, email, entity..."
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] py-2.5 pl-10 pr-4 text-sm" />
        </div>
        <div className="relative">
          <button onClick={() => setShowFilter(!showFilter)}
            className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm hover:bg-[var(--color-muted)]">
            <Filter className="h-4 w-4" /> {action || "All Actions"}
          </button>
          {showFilter && (
            <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] shadow-lg">
              {["", "CREATE", "UPDATE", "DELETE", "LOGIN"].map((a) => (
                <button key={a} onClick={() => { setAction(a); setShowFilter(false); setPage(1); }}
                  className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--color-muted)]">
                  {a || "All Actions"}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={handleSearch} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 platform-btn-gradient">Search</button>
      </div>

      <PlatformGlassCard className="overflow-x-auto">
        <table className="w-full min-w-[550px] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]">
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-muted-fg)]">Timestamp</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-muted-fg)]">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-muted-fg)]">Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-muted-fg)]">Entity</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-muted-fg)]">Description</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-[var(--color-muted-fg)]">No audit log entries found</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-muted)]/50 platform-table-row">
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted-fg)]">
                    <Calendar className="h-3.5 w-3.5" /> {fmtDT(r.created_at)}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-sm">
                    <User className="h-3.5 w-3.5 text-[var(--color-muted-fg)]" />
                    <span>{r.user_email || "System"}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ACTION_STYLES[r.action] || "bg-gray-100 text-gray-700"}`}>
                    {r.action}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm">
                    <span className="font-mono text-xs text-[var(--color-muted-fg)]">{r.entity_type}</span>
                    {r.entity_id && <span className="ml-1 text-xs text-[var(--color-muted-fg)]">#{String(r.entity_id).slice(0, 8)}</span>}
                  </div>
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-sm text-[var(--color-muted-fg)]">{r.description || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PlatformGlassCard>

      <div className="flex items-center justify-between text-sm text-[var(--color-muted-fg)]">
        <span>Showing {rows.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
        <div className="flex gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 disabled:opacity-50 hover:bg-[var(--color-muted)]">
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 disabled:opacity-50 hover:bg-[var(--color-muted)]">
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
