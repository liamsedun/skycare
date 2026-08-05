"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, FlaskConical } from "lucide-react";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-foreground)]">Lab results</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Laboratory orders and completed results for your family.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading lab orders…</p>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <FlaskConical size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">No lab orders yet.</p>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Tests requested by your doctor will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
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
                      <p className="text-sm font-semibold text-[var(--color-foreground)]">
                        {order.patients ? `${order.patients.first_name} ${order.patients.last_name}` : ""}
                        {order.users?.full_name ? <span className="font-normal text-[var(--color-muted-fg)]"> · Dr. {order.users.full_name}</span> : null}
                      </p>
                      <p className="text-xs text-[var(--color-muted-fg)]">
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
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                          <th className="pb-2 font-medium">Test</th>
                          <th className="pb-2 font-medium">Sample</th>
                          <th className="pb-2 text-right font-medium">Result</th>
                          <th className="pb-2 text-right font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border)]">
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
                                  <span className="text-[var(--color-muted-fg)]">—</span>
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
  );
}
