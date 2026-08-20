"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, FlaskConical } from "lucide-react";
import { inDateRange } from "@/lib/daterange";
import { mutedXs, mutedFg, errorBanner, cardTitle, mutedSm, divideBorder, mutedXsMt, mutedXsMt1, sectionTitle, pageTitle, emptyState } from "@/lib/ui-constants";
import DateRangeBar from "@/components/filters/date-range-bar";
import {
  AppHeader,
  AppSkeletonList,
  AppStatusChip,
} from "@/components/patient/mobile/mobile-app-ui";

interface LabResult {
  id: string;
  result: string | null;
  unit: string | null;
  is_abnormal: boolean | null;
  result_file_url: string | null;
  reported_at: string | null;
}

interface LabOrderTest {
  id: string;
  test_name: string;
  sample_type: string | null;
  priority: string | null;
  lab_results: LabResult[];
}

interface LabOrder {
  id: string;
  status: string;
  requested_at: string;
  completed_at: string | null;
  notes: string | null;
  patients: { first_name: string; last_name: string } | null;
  users: { full_name: string } | null;
  lab_order_tests: LabOrderTest[];
}

function statusClass(status: string): string {
  switch (status) {
    case "completed": return "bg-emerald-100 text-emerald-700";
    case "in_progress": case "sample_collected": return "bg-sky-100 text-sky-700";
    case "requested": return "bg-amber-100 text-amber-700";
    case "cancelled": return "bg-slate-100 text-slate-500";
    default: return "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]";
  }
}

export default function PatientLabResults() {
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lab-orders?pageSize=100", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load lab orders");
      setOrders(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lab orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = orders.filter((order) => inDateRange(order.requested_at, from, to));

  return (
    <>
      <div className="hidden md:block">
        <div className="space-y-6">
      <div>
        <h1 className={pageTitle}>Lab results</h1>
        <p className={mutedSm}>Laboratory orders and completed results for your family.</p>
      </div>

      <DateRangeBar from={from} to={to} onFromChange={setFrom} onToChange={setTo} onClear={() => { setFrom(""); setTo(""); }} />

      {error && (
        <p role="alert" className={errorBanner}>
          {error}
        </p>
      )}

      {loading ? (
        <p className={emptyState}>Loading lab orders…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <FlaskConical size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className={sectionTitle}>No lab orders yet.</p>
          <p className={mutedSm}>Tests requested by your doctor will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((order) => {
            const open = expanded === order.id;
            const allReady = order.status === "completed";
            return (
              <div key={order.id} className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : order.id)}
                  className="focus-ring flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left"
                >
                  <div className="flex items-center gap-3">
                    <ChevronDown size={16} aria-hidden="true" className={`text-[var(--color-muted-fg)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                    <div>
                      <p className={cardTitle}>
                        {order.patients ? `${order.patients.first_name} ${order.patients.last_name}` : ""}
                        {order.users?.full_name ? <span className="font-normal text-[var(--color-muted-fg)]"> · Dr. {order.users.full_name}</span> : null}
                      </p>
                      <p className={mutedXs}>
                        {new Date(order.requested_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                        {order.lab_order_tests.length} test{order.lab_order_tests.length === 1 ? "" : "s"}
                        {order.notes ? ` · ${order.notes}` : ""}
                      </p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${statusClass(order.status)}`}>
                    {order.status.replace(/_/g, " ")}
                  </span>
                </button>

                {open && (
                  <div className="border-t border-[var(--color-border)] bg-slate-50/60 px-4 py-4">
                    <div className="-mx-4 overflow-x-auto px-4">
                      <table className="w-full min-w-[440px] text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                            <th className="pb-2 font-medium">Test</th>
                            <th className="pb-2 font-medium">Sample</th>
                            <th className="pb-2 text-right font-medium">Result</th>
                            <th className="pb-2 text-right font-medium">Status</th>
                          </tr>
                        </thead>
                      <tbody className={divideBorder}>
                        {order.lab_order_tests.map((t) => {
                          const result = t.lab_results[0];
                          return (
                            <tr key={t.id}>
                              <td className="py-2.5 font-medium text-[var(--color-foreground)]">{t.test_name}</td>
                              <td className="py-2.5 text-[var(--color-muted-fg)]">{t.sample_type ?? "—"}</td>
                              <td className="py-2.5 text-right">
                                {allReady && result ? (
                                  <span className={result.is_abnormal ? "font-semibold text-red-600" : "text-[var(--color-foreground)]"}>
                                    {result.result}
                                    {result.unit ? ` ${result.unit}` : ""}
                                    {result.is_abnormal ? " ⚠" : ""}
                                  </span>
                                ) : (
                                  <span className={mutedFg}>—</span>
                                )}
                              </td>
                              <td className="py-2.5 text-right">
                                {allReady && result ? (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                                    {result.is_abnormal ? "Abnormal" : "Normal"}
                                  </span>
                                ) : (
                                  <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">Pending</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      </table>
                    </div>
                    {allReady && order.completed_at && (
                      <p className="mt-3 text-right text-xs text-[var(--color-muted-fg)]">
                        Reported {new Date(order.completed_at).toLocaleString("en-NG")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
      </div>

      {/* ── Mobile app view (Life Blossom parity, <md) ─────────────────── */}
      <div className="md:hidden">
        <div className="space-y-4">
          <AppHeader title="Lab Results" meta={`${visible.length} order${visible.length === 1 ? "" : "s"}`} />

          {error && (
            <p role="alert" className="rounded-xl bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
              {error}
            </p>
          )}

          {loading ? (
            <AppSkeletonList rows={3} />
          ) : visible.length === 0 ? (
            <div className="app-glass rounded-2xl py-10 text-center">
              <FlaskConical size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
              <p className={sectionTitle}>No lab orders yet.</p>
              <p className={mutedXsMt1}>Tests requested by your doctor will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map((order) => {
                const open = expanded === order.id;
                const allReady = order.status === "completed";
                return (
                  <div key={order.id} className="app-glass rounded-2xl p-4">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : order.id)}
                      aria-expanded={open}
                      className="flex w-full items-start gap-3 text-left"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#e0a84a]/20 to-[#e0a84a]/5 text-[#e0a84a]">
                        <FlaskConical size={18} aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">
                            {order.patients ? `${order.patients.first_name} ${order.patients.last_name}` : "Lab order"}
                          </p>
                          <AppStatusChip status={order.status} />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-[var(--color-muted-fg)]">
                          {order.users?.full_name ? `Dr. ${order.users.full_name} · ` : ""}
                          {new Date(order.requested_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                        <p className="mt-2 text-xs text-[var(--color-muted-fg)]">
                          {order.lab_order_tests.length} test{order.lab_order_tests.length === 1 ? "" : "s"}
                          {order.notes ? ` · ${order.notes}` : ""}
                        </p>
                      </div>
                    </button>

                    {open && (
                      <div className="mt-3 border-t border-[var(--color-border)] pt-3">
                        <ul className="space-y-2">
                          {order.lab_order_tests.map((t) => {
                            const result = t.lab_results[0];
                            return (
                              <li key={t.id} className="rounded-xl border border-[var(--color-border)] p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <p className={cardTitle}>{t.test_name}</p>
                                  {allReady && result ? (
                                    <span
                                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                        result.is_abnormal ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-700"
                                      }`}
                                    >
                                      {result.is_abnormal ? "Abnormal" : "Normal"}
                                    </span>
                                  ) : (
                                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">Pending</span>
                                  )}
                                </div>
                                <p className={mutedXsMt}>{t.sample_type ?? "—"}</p>
                                {allReady && result && (
                                  <p className={`mt-1.5 text-sm font-medium ${result.is_abnormal ? "text-rose-600" : "text-[var(--color-foreground)]"}`}>
                                    {result.result}
                                    {result.unit ? ` ${result.unit}` : ""}
                                    {result.is_abnormal ? " ⚠" : ""}
                                  </p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                        {allReady && order.completed_at && (
                          <p className="mt-3 text-xs text-[var(--color-muted-fg)]">
                            Reported {new Date(order.completed_at).toLocaleString("en-US")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
