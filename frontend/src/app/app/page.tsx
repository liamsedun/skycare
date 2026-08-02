import Link from "next/link";
import { Banknote, CalendarClock, FlaskConical, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatTime, ngn } from "@/lib/auth";
import StatCard from "@/components/dashboard/stat-card";
import StatusBadge from "@/components/dashboard/status-badge";
import RevenueChart, { type RevenuePoint } from "@/components/dashboard/revenue-chart";

export const dynamic = "force-dynamic";

const PENDING_LAB_STATUSES = ["requested", "sample_collected", "in_progress"];

interface TodayAppointment {
  id: string;
  scheduled_date: string;
  start_time: string;
  status: string;
  type: string;
  reason: string | null;
  patients: { first_name: string; last_name: string; patient_number: string } | null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonthISO() {
  return new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
}

export default async function OverviewPage() {
  const supabase = await createClient();
  const today = todayISO();

  const [patientCount, apptList, revenueRes, labCount, chartRes] = await Promise.all([
    safe(() =>
      supabase
        .from("patients")
        .select("id", { count: "exact", head: true })
        .then((r) => r.count)
    ),
    safe(() =>
      supabase
        .from("appointments")
        .select(
          "id, scheduled_date, start_time, status, type, reason, patients(first_name, last_name, patient_number)"
        )
        .eq("scheduled_date", today)
        .order("start_time", { ascending: true })
        .limit(10)
        .then((r) => r.data as unknown as TodayAppointment[] | null)
    ),
    safe(() =>
      supabase
        .from("payments")
        .select("amount")
        .eq("status", "completed")
        .gte("paid_at", startOfMonthISO())
        .then((r) => (r.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0))
    ),
    safe(() =>
      supabase
        .from("lab_orders")
        .select("id", { count: "exact", head: true })
        .in("status", PENDING_LAB_STATUSES)
        .then((r) => r.count)
    ),
    safe(() =>
      supabase
        .from("v_revenue_monthly")
        .select("month, revenue")
        .order("month", { ascending: true })
        .limit(6)
        .then((r) => (r.data ?? []) as RevenuePoint[])
    ),
  ]);

  const todaysAppointments = apptList ?? [];
  const revenueThisMonth = revenueRes ?? 0;
  const monthlyRevenue = chartRes ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-foreground)]">
          Hospital overview
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
          {today} — here&apos;s what&apos;s happening in your hospital today.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total patients"
          value={patientCount == null ? "—" : String(patientCount)}
          hint="All branches"
          icon={Users}
        />
        <StatCard
          label="Today&apos;s appointments"
          value={String(todaysAppointments.length)}
          hint={`${today}`}
          icon={CalendarClock}
          tone="accent"
        />
        <StatCard
          label="Revenue this month"
          value={ngn(revenueThisMonth)}
          hint="Completed payments"
          icon={Banknote}
          tone="warning"
        />
        <StatCard
          label="Pending lab orders"
          value={labCount == null ? "—" : String(labCount)}
          hint="Awaiting collection / results"
          icon={FlaskConical}
          tone="destructive"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <section className="rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)] xl:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-heading)] text-base font-semibold">
              Revenue — last 6 months
            </h2>
            <Link
              href="/app/billing"
              className="focus-ring text-sm font-medium text-[var(--color-primary)] transition-colors duration-200 hover:underline"
            >
              Billing →
            </Link>
          </div>
          <div className="mt-4">
            <RevenueChart data={monthlyRevenue} />
          </div>
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)] xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-heading)] text-base font-semibold">
              Today&apos;s appointments
            </h2>
            <Link
              href="/app/appointments"
              className="focus-ring text-sm font-medium text-[var(--color-primary)] transition-colors duration-200 hover:underline"
            >
              View all →
            </Link>
          </div>
          {todaysAppointments.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--color-muted-fg)]">
              No appointments scheduled for today.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--color-border)]">
              {todaysAppointments.map((appt) => {
                const patient = appt.patients;
                return (
                  <li key={appt.id} className="flex items-center gap-3 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-muted)] text-xs font-bold text-[var(--color-muted-fg)]">
                      {formatTime(appt.start_time)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--color-foreground)]">
                        {patient ? `${patient.first_name} ${patient.last_name}` : "Unknown patient"}
                      </p>
                      <p className="truncate text-xs text-[var(--color-muted-fg)]">
                        {patient?.patient_number ?? ""}
                        {appt.reason ? ` · ${appt.reason}` : ""}
                      </p>
                    </div>
                    <StatusBadge status={appt.status} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

async function safe<T>(fn: () => PromiseLike<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
