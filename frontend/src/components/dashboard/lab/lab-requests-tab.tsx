"use client";

import { FlaskConical, Loader2 } from "lucide-react";
import { flexWrapGap2, mutedXsMt, sectionTitle } from "@/lib/ui-constants";
import DateRangeBar from "@/components/filters/date-range-bar";
import { LabRequest, STATUS_FILTERS, statusClass } from "./lab-shared";

// ---------------------------------------------------------------------------
// REQUESTS TAB — filter chips + search + date range + request cards
// ---------------------------------------------------------------------------
export function RequestsTab({
  filter,
  onFilterChange,
  q,
  onQueryChange,
  fromDate,
  toDate,
  onFromChange,
  onToChange,
  onClearDates,
  loading,
  requests,
  onView,
}: {
  filter: string;
  onFilterChange: (filter: string) => void;
  q: string;
  onQueryChange: (q: string) => void;
  fromDate: string;
  toDate: string;
  onFromChange: (date: string) => void;
  onToChange: (date: string) => void;
  onClearDates: () => void;
  loading: boolean;
  requests: LabRequest[];
  onView: (id: string) => void;
}) {
  return (
    <>
      <div className={flexWrapGap2} role="group" aria-label="Filter lab requests">
        {STATUS_FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onFilterChange(item)}
            aria-pressed={filter === item}
            className={`focus-ring rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-colors duration-200 ${
              filter === item ? "bg-[var(--color-primary)] text-white" : "bg-white text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
            }`}
          >
            {item.replace(/_/g, " ")}
          </button>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-[var(--color-border)] sm:block" aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search patient, service, referrer…"
          aria-label="Search lab requests"
          className="h-9 w-56 rounded-lg border border-[var(--color-border)] bg-white px-2 text-xs text-[var(--color-foreground)] outline-none transition-colors duration-200 focus:border-[var(--color-primary)]"
        />
        <DateRangeBar
          from={fromDate}
          to={toDate}
          onFromChange={onFromChange}
          onToChange={onToChange}
          onClear={onClearDates}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" aria-hidden="true" />
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <FlaskConical size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className={sectionTitle}>No lab requests found.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {requests.map((req) => (
            <div key={req.id} className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--color-foreground)]">
                    {req.patients ? `${req.patients.first_name} ${req.patients.last_name}` : "Unknown"}
                  </p>
                  <p className={mutedXsMt}>
                    {req.patients?.patient_number ?? ""} · {new Date(req.requested_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClass(req.status)}`}>
                  {req.status.replace(/_/g, " ")}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {req.is_external && (
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                    External{req.external_lab_id ? ` · ${req.external_lab_id}` : ""}
                  </span>
                )}
                {req.users && (
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                    {req.users.full_name}
                  </span>
                )}
              </div>
              <p className="mt-3 text-xs text-[var(--color-muted-fg)]">
                {req.lab_request_items.map((t) => t.service_name).join(", ")}
              </p>
              <button
                type="button"
                onClick={() => onView(req.id)}
                className="focus-ring mt-3 w-full rounded-lg border border-[var(--color-border)] py-2 text-xs font-semibold text-[var(--color-primary)] transition-colors duration-200 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
              >
                View request
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}