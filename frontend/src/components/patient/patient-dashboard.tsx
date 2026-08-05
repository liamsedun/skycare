"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, FlaskConical, ReceiptText } from "lucide-react";

interface Appointment {
  id: string;
  scheduled_date: string;
  start_time: string;
  type: string;
  status: string;
  reason: string | null;
  patients: { first_name: string; last_name: string } | null;
  users: { full_name: string } | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  paid_amount: number;
  due_date: string | null;
  patients: { first_name: string; last_name: string } | null;
}

interface LabOrder {
  id: string;
  status: string;
  requested_at: string;
  patients: { first_name: string; last_name: string } | null;
  lab_order_tests: Array<{
    test_name: string;
    lab_results: Array<{ result: string | null; is_abnormal: boolean }>;
  }>;
}

function ngn(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(amount);
}

function statusClass(status: string): string {
  switch (status) {
    case "paid": case "completed": case "dispensed": return "bg-emerald-100 text-emerald-700";
    case "pending": case "requested": return "bg-amber-100 text-amber-700";
    case "partially_paid": case "sample_collected": case "in_progress": case "active": case "partially_dispensed":
      return "bg-sky-100 text-sky-700";
    default: return "bg-slate-100 text-slate-600";
  }
}

export default function PatientDashboard({ fullName }: { fullName: string }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const [apptRes, invRes, labRes] = await Promise.all([
          fetch(`/api/appointments?from=${today}&pageSize=5`, { cache: "no-store" }),
          fetch("/api/invoices?pageSize=100", { cache: "no-store" }),
          fetch("/api/lab-orders?pageSize=5", { cache: "no-store" }),
        ]);
        const apptBody = await apptRes.json();
        const invBody = await invRes.json();
        const labBody = await labRes.json();
        if (apptRes.ok) setAppointments(apptBody.data ?? []);
        if (invRes.ok) setInvoices(invBody.data ?? []);
        if (labRes.ok) setLabOrders(labBody.data ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const outstanding = invoices
    .filter((inv) => ["pending", "partially_paid"].includes(inv.status))
    .reduce((sum, inv) => sum + (Number(inv.total_amount) - Number(inv.paid_amount)), 0);
  const resultsReady = labOrders.filter(
    (order) => order.status === "completed" && order.lab_order_tests.some((t) => t.lab_results.length > 0)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-foreground)]">
          Welcome back, {fullName.split(/\s+/)[0]}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
          Here&apos;s what&apos;s happening with your care.
        </p>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Link
              href="/patient/appointments"
              className="focus-ring rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)] transition-colors duration-200 hover:border-[var(--color-primary)]"
            >
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">
                <CalendarClock size={14} aria-hidden="true" /> Upcoming appointments
              </p>
              <p className="mt-2 text-2xl font-bold text-[var(--color-foreground)]">
                {appointments.filter((a) => a.status !== "cancelled").length}
              </p>
            </Link>
            <Link
              href="/patient/billing"
              className="focus-ring rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)] transition-colors duration-200 hover:border-[var(--color-primary)]"
            >
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">
                <ReceiptText size={14} aria-hidden="true" /> Outstanding balance
              </p>
              <p className="mt-2 text-2xl font-bold text-amber-600">{ngn(outstanding)}</p>
            </Link>
            <Link
              href="/patient/lab-results"
              className="focus-ring rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)] transition-colors duration-200 hover:border-[var(--color-primary)]"
            >
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">
                <FlaskConical size={14} aria-hidden="true" /> Results ready
              </p>
              <p className="mt-2 text-2xl font-bold text-[var(--color-foreground)]">{resultsReady.length}</p>
            </Link>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
                <h2 className="text-sm font-semibold text-[var(--color-foreground)]">Upcoming appointments</h2>
                <Link href="/patient/appointments" className="focus-ring text-xs font-medium text-[var(--color-primary)] hover:underline">
                  Book / view all
                </Link>
              </div>
              {appointments.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[var(--color-muted-fg)]">
                  No upcoming appointments.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--color-border)]">
                  {appointments.slice(0, 3).map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div>
                        <p className="font-medium text-[var(--color-foreground)]">
                          {new Date(`${a.scheduled_date}T${a.start_time || "00:00"}`).toLocaleDateString("en-NG", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}{" "}
                          · {a.start_time}
                        </p>
                        <p className="text-xs capitalize text-[var(--color-muted-fg)]">
                          {a.type.replace(/_/g, " ")}
                          {a.users?.full_name ? ` · ${a.users.full_name}` : ""}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusClass(a.status)}`}>
                        {a.status.replace(/_/g, " ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
                <h2 className="text-sm font-semibold text-[var(--color-foreground)]">Bills</h2>
                <Link href="/patient/billing" className="focus-ring text-xs font-medium text-[var(--color-primary)] hover:underline">
                  View all
                </Link>
              </div>
              {invoices.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[var(--color-muted-fg)]">No invoices yet.</p>
              ) : (
                <ul className="divide-y divide-[var(--color-border)]">
                  {invoices.slice(0, 4).map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div>
                        <p className="font-mono font-medium text-[var(--color-foreground)]">{inv.invoice_number}</p>
                        <p className="text-xs text-[var(--color-muted-fg)]">
                          {inv.patients ? `${inv.patients.first_name} ${inv.patients.last_name}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-[var(--color-foreground)]">{ngn(Number(inv.total_amount))}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusClass(inv.status)}`}>
                          {inv.status.replace(/_/g, " ")}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
