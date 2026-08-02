import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime } from "@/lib/auth";
import StatusBadge from "@/components/dashboard/status-badge";

export const dynamic = "force-dynamic";

export const APPOINTMENT_STATUSES = [
  "scheduled",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
] as const;

interface AppointmentRow {
  id: string;
  scheduled_date: string;
  start_time: string;
  status: string;
  type: string;
  reason: string | null;
  patients: { first_name: string; last_name: string; patient_number: string } | null;
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = APPOINTMENT_STATUSES.includes(status as (typeof APPOINTMENT_STATUSES)[number])
    ? (status as string)
    : null;

  const supabase = await createClient();
  let appointments: AppointmentRow[] = [];

  try {
    let builder = supabase
      .from("appointments")
      .select(
        "id, scheduled_date, start_time, status, type, reason, patients(first_name, last_name, patient_number)"
      )
      .gte("scheduled_date", new Date().toISOString().slice(0, 10))
      .order("scheduled_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(100);

    if (filter) {
      builder = builder.eq("status", filter);
    }

    const { data } = await builder;
    appointments = (data ?? []) as unknown as AppointmentRow[];
  } catch {
    appointments = [];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-foreground)]">
          Appointments
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
          Upcoming and in-progress appointments, from today onward.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        <Link
          href="/app/appointments"
          aria-current={!filter ? "page" : undefined}
          className={`focus-ring rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
            !filter
              ? "bg-[var(--color-primary)] text-white"
              : "bg-white text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
          }`}
        >
          All
        </Link>
        {APPOINTMENT_STATUSES.map((item) => (
          <Link
            key={item}
            href={`/app/appointments?status=${item}`}
            aria-current={filter === item ? "page" : undefined}
            className={`focus-ring rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-colors duration-200 ${
              filter === item
                ? "bg-[var(--color-primary)] text-white"
                : "bg-white text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
            }`}
          >
            {item.replace(/_/g, " ")}
          </Link>
        ))}
      </div>

      {appointments.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <CalendarClock
            size={40}
            aria-hidden="true"
            className="mx-auto text-[var(--color-muted-fg)]"
          />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">
            {filter ? `No ${filter.replace(/_/g, " ")} appointments.` : "No upcoming appointments."}
          </p>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
            New bookings from your hospital website appear here instantly.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                  <th scope="col" className="px-4 py-3 font-semibold">Date</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Time</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Patient</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Reason</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {appointments.map((appt) => (
                  <tr key={appt.id} className="transition-colors duration-150 hover:bg-[var(--color-muted)]">
                    <td className="px-4 py-3 whitespace-nowrap text-[var(--color-foreground)]">
                      {formatDate(appt.scheduled_date)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium">
                      {formatTime(appt.start_time)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--color-foreground)]">
                        {appt.patients
                          ? `${appt.patients.first_name} ${appt.patients.last_name}`
                          : "Unknown patient"}
                      </p>
                      <p className="font-mono text-xs text-[var(--color-muted-fg)]">
                        {appt.patients?.patient_number ?? ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 capitalize text-[var(--color-muted-fg)]">
                      {appt.type.replace(/_/g, " ")}
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-[var(--color-muted-fg)]">
                      {appt.reason ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={appt.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
