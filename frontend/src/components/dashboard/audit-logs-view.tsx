"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Download, ShieldAlert } from "lucide-react";
import { ROLE_LABELS } from "@/lib/auth";
import { mutedFg, errorBanner, mutedSm, divideBorder, fgMedium, sectionTitle, pageTitle, emptyState } from "@/lib/ui-constants";

const inputCls =
  "rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]";

const ENTITY_TYPES = [
  "appointments", "patients", "invoices", "payments", "prescriptions", "medical_records",
  "lab_orders", "lab_tests", "expenses", "other_income", "staff", "users", "auth",
] as const;

const ACTIONS = [
  "create", "update", "delete", "view", "login", "logout", "login_failed", "export", "permission_denied",
] as const;

const EVENT_TYPES = [
  "failed_login", "rapid_view", "locked_out", "login_blocked", "permission_denied",
] as const;

const SEVERITIES = ["info", "warning", "high", "critical"] as const;

const STAFF_ROLE_KEYS = Object.keys(ROLE_LABELS);

interface AuditRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  role: string | null;
  description: string | null;
  changes: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  users: { id: string; full_name: string | null; email: string | null } | null;
}

interface SecurityEvent {
  id: string;
  event_type: string;
  severity: string;
  description: string;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  users: { id: string; full_name: string | null; email: string | null } | null;
}

function actionClass(action: string): string {
  switch (action) {
    case "create": return "bg-emerald-100 text-emerald-700";
    case "update": return "bg-sky-100 text-sky-700";
    case "delete": return "bg-red-100 text-red-700";
    case "view": case "login": case "logout": return "bg-slate-100 text-slate-600";
    case "login_failed": return "bg-amber-100 text-amber-700";
    case "permission_denied": return "bg-purple-100 text-purple-700";
    default: return "bg-slate-100 text-slate-600";
  }
}

function severityClass(severity: string): string {
  switch (severity) {
    case "critical": return "bg-red-100 text-red-700";
    case "high": return "bg-orange-100 text-orange-700";
    case "warning": return "bg-amber-100 text-amber-700";
    default: return "bg-slate-100 text-slate-600";
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function toCSV(rows: AuditRow[] | SecurityEvent[], kind: "audit" | "events"): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header =
    kind === "audit"
      ? ["time", "user", "role", "action", "entity", "entity_id", "description", "ip"]
      : ["time", "user", "event_type", "severity", "description", "ip"];
  const lines = [header.join(",")];
  for (const r of rows) {
    if (kind === "audit") {
      const a = r as AuditRow;
      lines.push([a.created_at, a.users?.full_name ?? a.users?.email ?? "", a.role ?? "", a.action, a.entity_type, a.entity_id ?? "", a.description ?? "", a.ip_address ?? ""].map(esc).join(","));
    } else {
      const e = r as SecurityEvent;
      lines.push([e.created_at, e.users?.full_name ?? e.users?.email ?? "", e.event_type, e.severity, e.description, e.ip_address ?? ""].map(esc).join(","));
    }
  }
  return lines.join("\n");
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditLogsView() {
  const [tab, setTab] = useState<"audit" | "events">("audit");
  const [rows, setRows] = useState<AuditRow[] | SecurityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const pageSize = 20;

  // audit filters
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [role, setRole] = useState("");
  // event filters
  const [eventType, setEventType] = useState("");
  const [severity, setSeverity] = useState("");
  // shared
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (tab === "audit") {
        if (entityType) params.set("entity_type", entityType);
        if (action) params.set("action", action);
        if (role) params.set("role", role);
      } else {
        if (eventType) params.set("event_type", eventType);
        if (severity) params.set("severity", severity);
      }
      if (from) params.set("from", `${from}T00:00:00.000Z`);
      if (to) params.set("to", `${to}T23:59:59.999Z`);
      const res = await fetch(`/api/${tab === "audit" ? "audit-logs" : "security-events"}?${params}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load");
      setRows(body.data ?? []);
      setTotal(body.meta?.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [tab, page, entityType, action, role, eventType, severity, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  function resetFilters() {
    setEntityType(""); setAction(""); setRole("");
    setEventType(""); setSeverity(""); setFrom(""); setTo("");
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={pageTitle}>
            Audit & security
          </h1>
          <p className={mutedSm}>
            Append-only activity log and security anomaly events for your hospital.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            const kind = tab === "audit" ? "audit" : "events";
            downloadCSV(toCSV(rows, kind), `skycare-${kind}-${new Date().toISOString().slice(0, 10)}.csv`);
          }}
          disabled={rows.length === 0}
          className="focus-ring inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50 disabled:opacity-50"
        >
          <Download size={16} aria-hidden="true" /> Export page (CSV)
        </button>
      </div>

      <div className="flex gap-1 rounded-xl border border-[var(--color-border)] bg-white p-1 shadow-[var(--shadow-sm)]">
        <button
          type="button"
          onClick={() => { setTab("audit"); setPage(1); setExpanded(null); }}
          className={`focus-ring flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-200 ${tab === "audit" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-muted-fg)] hover:bg-slate-50"}`}
        >
          Audit Logs
        </button>
        <button
          type="button"
          onClick={() => { setTab("events"); setPage(1); setExpanded(null); }}
          className={`focus-ring flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-200 ${tab === "events" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-muted-fg)] hover:bg-slate-50"}`}
        >
          Security Events
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
        {tab === "audit" ? (
          <>
            <div>
              <label className={labelCls} htmlFor="f-entity">Entity</label>
              <select id="f-entity" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} className={inputCls}>
                <option value="">All entities</option>
                {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="f-action">Action</label>
              <select id="f-action" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className={inputCls}>
                <option value="">All actions</option>
                {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="f-role">Role</label>
              <select id="f-role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className={inputCls}>
                <option value="">All roles</option>
                {STAFF_ROLE_KEYS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r as keyof typeof ROLE_LABELS]}</option>)}
              </select>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className={labelCls} htmlFor="f-event">Event type</label>
              <select id="f-event" value={eventType} onChange={(e) => { setEventType(e.target.value); setPage(1); }} className={inputCls}>
                <option value="">All events</option>
                {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="f-sev">Severity</label>
              <select id="f-sev" value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }} className={inputCls}>
                <option value="">All severities</option>
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </>
        )}
        <div>
          <label className={labelCls} htmlFor="f-from">From</label>
          <input id="f-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="f-to">To</label>
          <input id="f-to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={inputCls} />
        </div>
        <button
          type="button"
          onClick={resetFilters}
          className="focus-ring rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-slate-50"
        >
          Reset
        </button>
      </div>

      {error && (
        <p role="alert" className={errorBanner}>
          {error}
        </p>
      )}

      {loading ? (
        <p className={emptyState}>Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <ShieldAlert size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className={sectionTitle}>
            {tab === "audit" ? "No audit entries match these filters." : "No security events match these filters."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
          <ul className={divideBorder}>
            {(rows as Array<AuditRow & SecurityEvent>).map((row) => {
              const isAudit = tab === "audit";
              const open = expanded === row.id;
              const badge = isAudit ? row.action : row.severity;
              const badgeCls = isAudit ? actionClass(row.action) : severityClass(row.severity);
              const meta = isAudit ? row.entity_type : row.event_type;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : row.id)}
                    className="focus-ring flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 text-left hover:bg-slate-50/70"
                  >
                    <ChevronDown size={15} aria-hidden="true" className={`shrink-0 text-[var(--color-muted-fg)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                    <span className="w-40 shrink-0 text-xs text-[var(--color-muted-fg)]">{fmtDate(row.created_at)}</span>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${badgeCls}`}>{badge}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--color-foreground)]">
                        {isAudit ? (row.description || `${row.action} ${row.entity_type}`) : row.description}
                      </span>
                      <span className="block text-xs text-[var(--color-muted-fg)]">
                        {isAudit ? `${meta}${row.entity_id ? ` · ${row.entity_id.slice(0, 8)}` : ""}` : meta}
                        {row.ip_address ? ` · IP ${row.ip_address}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {isAudit && row.role && (
                        <span className="hidden rounded-full bg-[var(--color-primary-soft)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--color-primary-dark)] sm:inline-block">
                          {ROLE_LABELS[row.role as keyof typeof ROLE_LABELS] ?? row.role}
                        </span>
                      )}
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[10px] font-bold text-[var(--color-primary-dark)]" aria-hidden="true">
                        {initials(row.users?.full_name ?? row.users?.email ?? "?")}
                      </span>
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-[var(--color-border)] bg-slate-50/60 px-4 py-4 pl-11 text-sm">
                      <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                        <p className={mutedFg}>
                          <span className={fgMedium}>User:</span>{" "}
                          {row.users?.full_name ?? row.users?.email ?? "—"}
                        </p>
                        <p className={mutedFg}>
                          <span className={fgMedium}>Time:</span>{" "}
                          {new Date(row.created_at).toLocaleString("en-NG")}
                        </p>
                        <p className={mutedFg}>
                          <span className={fgMedium}>Entity ID:</span>{" "}
                          <span className="font-mono">{row.entity_id ?? "—"}</span>
                        </p>
                        <p className="truncate text-[var(--color-muted-fg)]" title={row.user_agent ?? undefined}>
                          <span className={fgMedium}>User agent:</span>{" "}
                          {row.user_agent ?? "—"}
                        </p>
                      </div>
                      {isAudit && (row as AuditRow).changes && (
                        <details className="mt-3 rounded-lg border border-[var(--color-border)] bg-white">
                          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
                            Column changes
                          </summary>
                          <pre className="max-h-72 overflow-auto border-t border-[var(--color-border)] p-3 text-xs leading-relaxed text-[var(--color-foreground)]">
                            {JSON.stringify((row as AuditRow).changes, null, 2)}
                          </pre>
                        </details>
                      )}
                      {!isAudit && (row as SecurityEvent).metadata && (
                        <details className="mt-3 rounded-lg border border-[var(--color-border)] bg-white">
                          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
                            Metadata
                          </summary>
                          <pre className="max-h-72 overflow-auto border-t border-[var(--color-border)] p-3 text-xs leading-relaxed text-[var(--color-foreground)]">
                            {JSON.stringify((row as SecurityEvent).metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between text-sm">
          <p className={mutedFg}>
            Page {page} of {totalPages} · {total} entr{total === 1 ? "y" : "ies"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="focus-ring rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 font-medium transition-colors duration-200 hover:bg-slate-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="focus-ring rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 font-medium transition-colors duration-200 hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
