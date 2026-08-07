"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { CLINICIAN_ROLES } from "@/lib/auth";

interface PatientOption {
  id: string;
  label: string;
}

interface DoctorOption {
  id: string;
  label: string;
}

interface AppointmentActionProps {
  appointment: {
    id: string;
    status: string;
  };
}

const STATUS_ACTIONS: Record<string, { next: string; label: string; danger?: boolean }[]> = {
  scheduled: [
    { next: "confirmed", label: "Confirm" },
    { next: "in_progress", label: "Start" },
    { next: "cancelled", label: "Cancel", danger: true },
  ],
  confirmed: [
    { next: "in_progress", label: "Start" },
    { next: "cancelled", label: "Cancel", danger: true },
  ],
  in_progress: [{ next: "completed", label: "Complete" }],
};

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

export function AppointmentActions({ appointment }: AppointmentActionProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actions = STATUS_ACTIONS[appointment.status] ?? [];

  async function updateStatus(next: string) {
    if (next === "cancelled" && !confirm("Cancel this appointment?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/appointments/${appointment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update appointment");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update appointment");
    } finally {
      setBusy(false);
    }
  }

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && (
        <span role="alert" className="text-xs font-medium text-[var(--color-destructive)]">
          {error}
        </span>
      )}
      {actions.map((action) => (
        <button
          key={action.next}
          type="button"
          onClick={() => updateStatus(action.next)}
          disabled={busy}
          className={`focus-ring rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors duration-200 disabled:opacity-60 ${
            action.danger
              ? "border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50"
              : "border-[var(--color-border)] text-[var(--color-primary)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
          }`}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

export function NewAppointmentButton({ onBooked }: { onBooked?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);

  const loadOptions = useCallback(async () => {
    try {
      const [patientRes, staffRes] = await Promise.all([
        fetch("/api/patients?pageSize=100", { cache: "no-store" }),
        fetch("/api/staff?pageSize=100", { cache: "no-store" }),
      ]);
      const patientBody = await patientRes.json();
      const staffBody = await staffRes.json();
      setPatients(
        (patientBody.data ?? []).map((p: { id: string; first_name: string; last_name: string; patient_number: string }) => ({
          id: p.id,
          label: `${p.first_name} ${p.last_name} (${p.patient_number})`,
        }))
      );
      setDoctors(
        (staffBody.data ?? [])
          .filter((s: { users?: { role?: string } }) => !!s.users?.role && CLINICIAN_ROLES.includes(s.users.role as (typeof CLINICIAN_ROLES)[number]))
          .map((s: { id: string; users?: { id?: string; full_name?: string } }) => ({
            id: s.users?.id ?? s.id,
            label: s.users?.full_name ?? "Doctor",
          }))
      );
    } catch {
      /* options are non-critical */
    }
  }, []);

  useEffect(() => {
    if (open) loadOptions();
  }, [open, loadOptions]);

  async function handleSubmit(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: form.get("patientId"),
          doctorId: (form.get("doctorId") as string) || undefined,
          scheduledDate: form.get("scheduledDate"),
          startTime: form.get("startTime"),
          endTime: (form.get("endTime") as string) || undefined,
          type: form.get("type"),
          reason: (form.get("reason") as string) || undefined,
          notes: (form.get("notes") as string) || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to book appointment");
      setOpen(false);
      onBooked?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to book appointment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]"
      >
        <CalendarPlus size={16} aria-hidden="true" /> New Appointment
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="New Appointment"
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">New Appointment</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit(new FormData(e.currentTarget));
              }}
            >
              <div>
                <label className={labelCls} htmlFor="a-patient">Patient</label>
                <select id="a-patient" name="patientId" required className={inputCls}>
                  <option value="">Select patient…</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="a-doctor">Doctor (optional)</label>
                <select id="a-doctor" name="doctorId" className={inputCls}>
                  <option value="">No doctor assigned</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} htmlFor="a-date">Date</label>
                  <input
                    id="a-date"
                    name="scheduledDate"
                    type="date"
                    required
                    min={new Date().toISOString().slice(0, 10)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="a-start">Start time</label>
                  <input id="a-start" name="startTime" type="time" required className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="a-type">Type</label>
                <select id="a-type" name="type" className={inputCls} defaultValue="in_person">
                  <option value="in_person">In-person visit</option>
                  <option value="telemedicine">Telemedicine</option>
                  <option value="home_visit">Home visit</option>
                  <option value="follow_up">Follow-up</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="a-reason">Reason</label>
                <input id="a-reason" name="reason" className={inputCls} placeholder="Reason for visit" />
              </div>
              {error && (
                <p
                  role="alert"
                  className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]"
                >
                  {error}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
                >
                  {busy ? "Booking…" : "Book appointment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
