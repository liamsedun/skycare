"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pill, Plus } from "lucide-react";
import { inDateRange } from "@/lib/daterange";
import type { AccessLevel } from "@/lib/nav";
import { errorBanner, mutedSm, flexWrapGap2, sectionTitle, pageTitle, emptyState } from "@/lib/ui-constants";
import DateRangeBar from "@/components/filters/date-range-bar";
import { Prescription, STATUS_FILTERS, statusClass } from "./pharmacy-prescriptions/pharmacy-prescriptions-shared";
import { CreateRxModal } from "./pharmacy-prescriptions/pharmacy-prescriptions-create-modal";
import { RxDetailModal } from "./pharmacy-prescriptions/pharmacy-prescriptions-detail-modal";

export default function PharmacyView({ canDispense, accessLevel = "full" }: { canDispense: boolean; accessLevel?: AccessLevel }) {
  const viewOnly = accessLevel === "view_only";
  const router = useRouter();
  const [rxs, setRxs] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (filter !== "all") params.set("status", filter);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/prescriptions?${params.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load prescriptions");
      setRxs(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load prescriptions");
    } finally {
      setLoading(false);
    }
  }, [filter, fromDate, toDate, q]);

  useEffect(() => {
    load();
  }, [load]);

  const viewed = viewId ? rxs.find((r) => r.id === viewId) ?? null : null;

  const visibleRxs = useMemo(
    () => rxs.filter((rx) => inDateRange(rx.issued_date, fromDate, toDate)),
    [rxs, fromDate, toDate]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={pageTitle}>Pharmacy</h1>
          <p className={mutedSm}>
            Prescriptions, dispensing and stock.
          </p>
        </div>
        {!viewOnly && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]"
          >
            <Plus size={16} aria-hidden="true" /> New Prescription
          </button>
        )}
      </div>

{error && (
          <p role="alert" className={errorBanner}>
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            {success}
          </p>
        )}

      <div className={flexWrapGap2} role="group" aria-label="Filter prescriptions">
        {STATUS_FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            aria-pressed={filter === item}
            className={`focus-ring rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-colors duration-200 ${
              filter === item
                ? "bg-[var(--color-primary)] text-white"
                : "bg-white text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
            }`}
          >
            {item.replace(/_/g, " ")}
          </button>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-[var(--color-border)] sm:block" aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search patient, doctor, medication…"
          aria-label="Search prescriptions"
          className="h-9 w-56 rounded-lg border border-[var(--color-border)] bg-white px-2 text-xs text-[var(--color-foreground)] outline-none transition-colors duration-200 focus:border-[var(--color-primary)]"
        />
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
      </div>

      {loading ? (
        <p className={emptyState}>Loading prescriptions…</p>
      ) : visibleRxs.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <Pill size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className={sectionTitle}>No prescriptions found.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleRxs.map((rx) => (
            <div key={rx.id} className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--color-foreground)]">
                    {rx.patients ? `${rx.patients.first_name} ${rx.patients.last_name}` : "Unknown"}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-[var(--color-muted-fg)]">
                    {rx.patients?.patient_number ?? ""} · {rx.issued_date}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClass(rx.status)}`}>
                  {rx.status.replace(/_/g, " ")}
                </span>
              </div>
              <p className="mt-3 text-xs text-[var(--color-muted-fg)]">
                {rx.prescription_items.length} medication(s) · by {rx.users?.full_name ?? "—"} ·{" "}
                {rx.pharmacy_type === "external" ? "External" : "In-house"}
              </p>
              <button
                type="button"
                onClick={() => setViewId(rx.id)}
                className="focus-ring mt-3 w-full rounded-lg border border-[var(--color-border)] py-2 text-xs font-semibold text-[var(--color-primary)] transition-colors duration-200 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
              >
                {viewOnly ? "View" : "View / dispense"}
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateRxModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {viewed && (
        <RxDetailModal
          rx={viewed}
          canDispense={canDispense}
          viewOnly={viewOnly}
          onClose={() => setViewId(null)}
          onChanged={() => load()}
          onDispensed={(msg) => {
            setSuccess(msg);
            setError(null);
          }}
        />
      )}
    </div>
  );
}

export { CreateRxModal } from "./pharmacy-prescriptions/pharmacy-prescriptions-create-modal";
export { EditRxModal } from "./pharmacy-prescriptions/pharmacy-prescriptions-edit-modal";
export { RxDetailModal } from "./pharmacy-prescriptions/pharmacy-prescriptions-detail-modal";