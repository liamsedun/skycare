"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, CheckCircle2, Clock, Loader2, Search, Stethoscope, User, X, XCircle } from "lucide-react";
import { NewAppointmentButton } from "@/components/dashboard/appointment-actions";
import { formatDate } from "@/lib/auth";
import { inDateRange } from "@/lib/daterange";
import DateRangeBar from "@/components/filters/date-range-bar";

type DisplayStatus = "Scheduled" | "Confirmed" | "In Progress" | "Completed" | "Cancelled";

const TABS = ["all", "scheduled", "confirmed", "in progress", "completed", "cancelled"] as const;

const STATUS_STYLES: Record<DisplayStatus, { icon: typeof Clock; circle: string; badge: string; label: string }> = {
  Scheduled: {
    icon: Clock,
    circle: "bg-amber-500/10 text-amber-600",
    badge: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    label: "Scheduled",
  },
  Confirmed: {
    icon: CheckCircle2,
    circle: "bg-sky-500/10 text-sky-600",
    badge: "bg-sky-500/10 text-sky-700 border-sky-500/30",
    label: "Confirmed",
  },
  "In Progress": {
    icon: Clock,
    circle: "bg-indigo-500/10 text-indigo-600",
    badge: "bg-indigo-500/10 text-indigo-700 border-indigo-500/30",
    label: "In Progress",
  },
  Completed: {
    icon: CheckCircle2,
    circle: "bg-emerald-500/10 text-emerald-600",
    badge: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    label: "Completed",
  },
  Cancelled: {
    icon: XCircle,
    circle: "bg-rose-500/10 text-rose-600",
    badge: "bg-rose-500/10 text-rose-700 border-rose-500/30",
    label: "Cancelled",
  },
};

const TYPE_LABELS: Record<string, string> = {
  in_person: "In-person visit",
  telemedicine: "Telemedicine",
  home_visit: "Home visit",
  follow_up: "Follow-up",
};

function mapStatus(apiStatus: string): DisplayStatus {
  switch (apiStatus) {
    case "scheduled":
      return "Scheduled";
    case "confirmed":
      return "Confirmed";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "cancelled":
    case "no_show":
      return "Cancelled";
    default:
      return "Scheduled";
  }
}

const ACTION_SETS: Record<DisplayStatus, string[]> = {
  Scheduled: ["confirmed", "cancelled"],
  Confirmed: ["completed", "cancelled"],
  "In Progress": ["completed"],
  Completed: [],
  Cancelled: [],
};

function fmtTime(t: string | null): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return t.slice(0, 5);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

interface AppointmentRow {
  id: string;
  scheduled_date: string;
  start_time: string;
  status: string;
  type: string;
  reason: string | null;
  patients: { first_name: string; last_name: string; patient_number: string } | null;
  users: { full_name: string; role: string } | null;
}

export default function AppointmentsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (search.trim()) params.set("q", search.trim());
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/appointments?${params.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load appointments");
      setAppointments((body.data ?? []) as AppointmentRow[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }, [search, fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }

  const filtered = useMemo(() => {
    return appointments.filter((a) => {
      const display = mapStatus(a.status);
      if (tab !== "all" && display.toLowerCase() !== tab) return false;
      const date = a.scheduled_date?.slice(0, 10) ?? "";
      if (!inDateRange(a.scheduled_date, fromDate, toDate)) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = [
          a.patients ? `${a.patients.first_name} ${a.patients.last_name}` : "",
          a.patients?.patient_number ?? "",
          a.users?.full_name ?? "",
          TYPE_LABELS[a.type] ?? a.type,
          date,
          a.start_time ?? "",
          a.reason ?? "",
          display,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [appointments, tab, search, fromDate, toDate]);

  async function updateStatus(apt: AppointmentRow, next: string) {
    if (next === "cancelled" && !confirm("Cancel this appointment?")) return;
    setActionLoading(apt.id);
    try {
      const res = await fetch(`/api/appointments/${apt.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update appointment");
      await load();
      const patient = apt.patients ? `${apt.patients.first_name} ${apt.patients.last_name}` : "patient";
      showToast("success", `Appointment ${next.replace(/_/g, " ")} for ${patient}`);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Failed to update appointment");
    } finally {
      setActionLoading(null);
    }
  }

  const hasFilters = Boolean(search || fromDate || toDate);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Appointments</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Schedule and manage patient appointments</p>
        </div>
        <NewAppointmentButton onBooked={load} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative max-w-sm flex-1">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by patient, doctor, date, reason…"
            aria-label="Search appointments"
            className="focus-ring w-full rounded-lg border border-[var(--color-border)] bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition-colors duration-200 placeholder:text-[var(--color-muted-fg)] focus:border-[var(--color-primary)]"
          />
        </div>
        <DateRangeBar
          from={fromDate}
          to={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
          onClear={() => {
            setFromDate("");
            setToDate("");
          }}
        />
        {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFromDate("");
                setToDate("");
              }}
              className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            >
              <X size={14} aria-hidden="true" /> Clear
            </button>
          )}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`focus-ring rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-colors duration-200 ${
              tab === t
                ? "bg-[var(--color-primary)] text-white"
                : "bg-white text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" aria-hidden="true" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <p className="text-sm font-medium text-[var(--color-destructive)]">{error}</p>
          <button
            type="button"
            onClick={load}
            className="focus-ring mt-3 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium transition-colors duration-200 hover:bg-[var(--color-muted)]"
          >
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <p className="text-sm font-medium text-[var(--color-foreground)]">
            No {tab === "all" ? "" : tab} appointments found.
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFromDate("");
                setToDate("");
              }}
              className="focus-ring mt-2 text-sm text-[var(--color-primary)] hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((apt) => {
            const display = mapStatus(apt.status);
            const style = STATUS_STYLES[display];
            const Icon = style.icon;
            const busy = actionLoading === apt.id;
            const patientName = apt.patients
              ? `${apt.patients.first_name} ${apt.patients.last_name}`
              : "—";
            return (
              <div
                key={apt.id}
                className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)] transition-shadow duration-200 hover:shadow-md sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3 sm:w-24 sm:shrink-0 sm:flex-col sm:gap-1">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-full ${style.circle}`}>
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <span className="text-sm font-semibold text-[var(--color-foreground)]">
                      {fmtTime(apt.start_time)}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-[var(--color-foreground)]">{patientName}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${style.badge}`}>
                        {style.label}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted-fg)]">
                      <span className="flex items-center gap-1">
                        <User size={14} aria-hidden="true" />
                        {apt.users?.full_name ?? "No doctor assigned"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar size={14} aria-hidden="true" />
                        {formatDate(apt.scheduled_date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Stethoscope size={14} aria-hidden="true" />
                        {TYPE_LABELS[apt.type] ?? apt.type}
                      </span>
                      {apt.reason && (
                        <span className="truncate italic">{apt.reason}</span>
                      )}
                    </div>
                  </div>

                  {ACTION_SETS[display].length > 0 ? (
                    <div className="flex shrink-0 items-center gap-2">
                      {ACTION_SETS[display].includes("confirmed") && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => updateStatus(apt, "confirmed")}
                          className="focus-ring h-8 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 text-xs font-medium text-sky-700 transition-colors duration-200 hover:bg-sky-500/20 disabled:opacity-60"
                        >
                          Confirm
                        </button>
                      )}
                      {ACTION_SETS[display].includes("completed") && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => updateStatus(apt, "completed")}
                          className="focus-ring h-8 rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary-soft)] px-3 text-xs font-medium text-[var(--color-primary-dark)] transition-colors duration-200 hover:bg-[var(--color-primary)] hover:text-white disabled:opacity-60"
                        >
                          Complete
                        </button>
                      )}
                      {ACTION_SETS[display].includes("cancelled") && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => updateStatus(apt, "cancelled")}
                          className="focus-ring h-8 rounded-lg px-3 text-xs font-medium text-rose-600 transition-colors duration-200 hover:bg-rose-50 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  ) : (
                    <span
                      className={`w-fit shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${style.badge}`}
                    >
                      {style.label}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 rounded-xl border px-4 py-3 text-sm font-medium shadow-2xl ${
            toast.type === "success"
              ? "border-emerald-500/30 bg-emerald-50 text-emerald-700"
              : "border-rose-500/30 bg-rose-50 text-rose-700"
          }`}
        >
          <span className="flex items-center gap-2">
            {toast.type === "success" ? (
              <CheckCircle2 size={16} aria-hidden="true" />
            ) : (
              <XCircle size={16} aria-hidden="true" />
            )}
            {toast.message}
          </span>
        </div>
      )}
    </div>
  );
}
