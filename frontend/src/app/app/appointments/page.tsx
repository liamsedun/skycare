import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime } from "@/lib/auth";
import StatusBadge from "@/components/dashboard/status-badge";
import {
  AppointmentActions,
  NewAppointmentButton,
} from "@/components/dashboard/appointment-actions";

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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <NewAppointmentButton />
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
        <>
          <div className="space-y-3 md:hidden">
            {appointments.map((appt) => (
              <div
                key={appt.id}
                className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--color-foreground)]">
                      {appt.patients
                        ? `${appt.patients.first_name} ${appt.patients.last_name}`
                        : "Unknown patient"}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-[var(--color-muted-fg)]">
                      {appt.patients?.patient_number ?? ""}
                    </p>
                  </div>
                  <StatusBadge status={appt.status} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div>
                    <dt className="text-[var(--color-muted-fg)]">Date</dt>
                    <dd className="font-medium text-[var(--color-foreground)]">
                      {formatDate(appt.scheduled_date)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-muted-fg)]">Time</dt>
                    <dd className="font-medium text-[var(--color-foreground)]">
                      {formatTime(appt.start_time)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-muted-fg)]">Type</dt>
                    <dd className="font-medium capitalize text-[var(--color-foreground)]">
                      {appt.type.replace(/_/g, " ")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-muted-fg)]">Reason</dt>
                    <dd className="truncate font-medium text-[var(--color-foreground)]">
                      {appt.reason ?? "—"}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3">
                  <AppointmentActions appointment={appt} />
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)] md:block">
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
                  <th scope="col" className="px-4 py-3 font-semibold">Actions</th>
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
                    <td className="px-4 py-3">
                      <AppointmentActions appointment={appt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
