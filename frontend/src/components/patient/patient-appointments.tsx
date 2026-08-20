"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, CalendarPlus, Check, Clock, Plus, X } from "lucide-react";
import { inDateRange } from "@/lib/daterange";
import { mutedXs, errorBanner, cardTitle, flexBetween, mutedSm, flexGap2, mutedXsMt, fgMedium, mutedXsMt1, sectionTitle, pageTitle, ghostIconBtn, emptyState, modalBackdrop } from "@/lib/ui-constants";
import DateRangeBar from "@/components/filters/date-range-bar";
import {
  AppFab,
  AppHeader,
  AppSegmented,
  AppSkeletonList,
  AppSheet,
  AppStatusChip,
  GhostButton,
  cn,
} from "@/components/patient/mobile/mobile-app-ui";

interface Appointment {
  id: string;
  scheduled_date: string;
  start_time: string;
  end_time: string | null;
  type: string;
  status: string;
  reason: string | null;
  notes: string | null;
  patients: { first_name: string; last_name: string } | null;
  users: { full_name: string } | null;
}

interface FamilyMember {
  id: string;
  patient_number: string;
  first_name: string;
  last_name: string;
  dependant_relationship: string | null;
  is_primary_account: boolean;
}

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

function statusClass(status: string): string {
  switch (status) {
    case "confirmed": return "bg-sky-100 text-sky-700";
    case "completed": return "bg-emerald-100 text-emerald-700";
    case "in_progress": return "bg-amber-100 text-amber-700";
    case "cancelled": case "no_show": return "bg-slate-100 text-slate-500";
    default: return "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]";
  }
}

export default function PatientAppointments() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBook, setShowBook] = useState(false);
  const [busy, setBusy] = useState(false);
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mobileTab, setMobileTab] = useState<"upcoming" | "past">("upcoming");
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/appointments?pageSize=100", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load appointments");
      setAppointments(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    (async () => {
      try {
        const res = await fetch("/api/patients/me", { cache: "no-store" });
        if (res.ok) {
          const body = await res.json();
          setFamily(body.data?.family ?? []);
        }
      } catch {
        // picker falls back to "Myself" disabled state below
      }
    })();
  }, [load]);

  async function confirmAppointment(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmed" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to confirm appointment");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to confirm appointment");
    } finally {
      setBusy(false);
    }
  }

  async function cancelAppointment(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to cancel appointment");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel appointment");
    } finally {
      setBusy(false);
    }
  }

  async function bookAppointment(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: form.get("patientId"),
          scheduledDate: form.get("scheduledDate"),
          startTime: form.get("startTime"),
          type: form.get("type"),
          reason: (form.get("reason") as string) || undefined,
          notes: (form.get("notes") as string) || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to book appointment");
      setShowBook(false);
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to book appointment");
    } finally {
      setBusy(false);
    }
  }

  function statusLabel(status: string): string {
    return status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }

  const cancellable = (a: Appointment) => ["scheduled", "confirmed"].includes(a.status);
  const confirmable = (a: Appointment) => a.status === "scheduled";

  const visible = appointments.filter((a) => inDateRange(a.scheduled_date, from, to));

  const mobileAppts = (visible: Appointment[]) =>
    mobileTab === "upcoming"
      ? visible.filter((a) => ["scheduled", "confirmed", "in_progress"].includes(a.status))
      : visible.filter((a) => ["completed", "cancelled", "no_show"].includes(a.status));

  return (
    <>
      <div className="hidden md:block">
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className={pageTitle}>
                Appointments
              </h1>
              <p className={mutedSm}>
                Your appointments and those of your family members.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowBook(true)}
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]"
            >
              <CalendarPlus size={16} aria-hidden="true" /> Book Appointment
            </button>
          </div>

          <DateRangeBar from={from} to={to} onFromChange={setFrom} onToChange={setTo} onClear={() => { setFrom(""); setTo(""); }} />

          {error && (
            <p role="alert" className={errorBanner}>
              {error}
            </p>
          )}

          {loading ? (
            <p className={emptyState}>Loading appointments…</p>
          ) : visible.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
              <CalendarPlus size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
              <p className={sectionTitle}>No appointments yet.</p>
              <p className={mutedSm}>Book your first appointment with the button above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map((a) => (
                <div key={a.id} className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className={fgMedium}>
                        {new Date(`${a.scheduled_date}T${a.start_time || "00:00"}`).toLocaleDateString("en-NG", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}{" "}
                        · <span className="font-semibold">{a.start_time}</span>
                      </p>
                      <p className={mutedXsMt}>
                        {a.patients ? `${a.patients.first_name} ${a.patients.last_name}` : ""} ·{" "}
                        {a.type.replace(/_/g, " ")}
                        {a.users?.full_name ? ` · Dr. ${a.users.full_name}` : ""}
                      </p>
                    </div>
                    <div className={flexGap2}>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${statusClass(a.status)}`}>
                        {statusLabel(a.status)}
                      </span>
                      {confirmable(a) && (
                        <button
                          type="button"
                          onClick={() => confirmAppointment(a.id)}
                          disabled={busy}
                          className="focus-ring rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-700 transition-colors duration-200 hover:bg-sky-100 disabled:opacity-60"
                        >
                          Confirm
                        </button>
                      )}
                      {cancellable(a) && (
                        <button
                          type="button"
                          onClick={() => cancelAppointment(a.id)}
                          disabled={busy}
                          className="focus-ring rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                  {a.reason && <p className="mt-2 text-sm text-[var(--color-muted-fg)]">Reason: {a.reason}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile app view (Life Blossom parity, <md) ─────────────────── */}
      <div className="md:hidden">
        <div className="space-y-4">
          <AppHeader title="Appointments" meta={`${mobileAppts(visible).length} total`} />

          <AppSegmented<"upcoming" | "past">
            tabs={[
              { key: "upcoming", label: "Upcoming" },
              { key: "past", label: "Past" },
            ]}
            active={mobileTab}
            onChange={setMobileTab}
          />

          {error && (
            <p role="alert" className="rounded-xl bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
              {error}
            </p>
          )}

          {loading ? (
            <AppSkeletonList rows={3} />
          ) : mobileAppts(visible).length === 0 ? (
            <div className="app-glass rounded-2xl py-10 text-center">
              <CalendarPlus size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
              <p className={sectionTitle}>
                No {mobileTab} appointments.
              </p>
              <p className={mutedXsMt1}>
                {mobileTab === "upcoming" ? "Book your next visit with the + button." : "Completed and cancelled visits will show here."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {mobileAppts(visible).map((a) => (
                <div key={a.id} className="app-glass rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#e0a84a]/20 to-[#e0a84a]/5 text-sm font-bold text-[#e0a84a]">
                      {a.users?.full_name
                        ? a.users.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("")
                        : "DR"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-semibold text-[var(--color-foreground)]">
                            {a.users?.full_name ? `Dr. ${a.users.full_name}` : "Doctor"}
                          </h4>
                          <p className="truncate text-xs text-[var(--color-muted-fg)]">
                            {a.patients ? `${a.patients.first_name} ${a.patients.last_name}` : ""} · {a.type.replace(/_/g, " ")}
                          </p>
                        </div>
                        <AppStatusChip status={a.status} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted-fg)]">
                        <span className="flex items-center gap-1">
                          <Calendar size={14} aria-hidden="true" />
                          {new Date(`${a.scheduled_date}T${a.start_time || "00:00"}`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={14} aria-hidden="true" />
                          {a.start_time}
                        </span>
                      </div>
                      {a.reason && (
                        <p className="mt-2 text-xs text-[var(--color-muted-fg)]">Reason: {a.reason}</p>
                      )}
                      {mobileTab === "upcoming" && (confirmable(a) || cancellable(a)) && (
                        <div className="mt-3 flex gap-2 border-t border-[var(--color-border)] pt-3">
                          {confirmable(a) && (
                            <button
                              type="button"
                              onClick={() => confirmAppointment(a.id)}
                              disabled={busy}
                              className="h-9 flex-1 rounded-xl border border-sky-500/20 text-xs font-medium text-sky-600 transition-colors hover:bg-sky-50 disabled:opacity-60"
                            >
                              Confirm
                            </button>
                          )}
                          {cancellable(a) && (
                            <button
                              type="button"
                              onClick={() => setCancelTarget(a)}
                              disabled={busy}
                              className="h-9 flex-1 rounded-xl border border-rose-500/20 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-50 disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <AppFab onClick={() => setShowBook(true)} label="Book an appointment">
            <Plus size={26} />
          </AppFab>
        </div>
      </div>

      {showBook && (
        <BookModal
          family={family}
          onClose={() => setShowBook(false)}
          onBooked={async (form) => {
            await bookAppointment(form);
          }}
          busy={busy}
          error={error}
        />
      )}

      <AppSheet
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title={
          <h3 className="text-base font-semibold text-[var(--color-foreground)]">Cancel Appointment</h3>
        }
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
            <X size={22} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={cardTitle}>
              {cancelTarget?.users?.full_name ? `Dr. ${cancelTarget.users.full_name}` : "Your appointment"}
            </p>
            <p className={mutedXsMt}>
              {cancelTarget?.scheduled_date
                ? `Cancel the visit on ${new Date(`${cancelTarget.scheduled_date}T${cancelTarget.start_time || "00:00"}`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${cancelTarget?.start_time ?? ""}?`
                : "Cancel this appointment?"}
            </p>
          </div>
        </div>
        <div className="mt-5 flex gap-3">
          <GhostButton className="flex-1" onClick={() => setCancelTarget(null)}>
            Keep
          </GhostButton>
          <button
            type="button"
            onClick={() => {
              const id = cancelTarget?.id;
              setCancelTarget(null);
              if (id) void cancelAppointment(id);
            }}
            disabled={busy}
            className={cn(
              "h-10 flex-1 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-sm font-semibold text-white transition-all hover:shadow-lg disabled:opacity-50"
            )}
          >
            {busy ? "Cancelling…" : "Yes, Cancel"}
          </button>
        </div>
      </AppSheet>
    </>
  );
}

function BookModal({
  family,
  onClose,
  onBooked,
  busy,
  error,
}: {
  family: FamilyMember[];
  onClose: () => void;
  onBooked: (form: FormData) => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div
      className={modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Book Appointment"
    >
      <div className="my-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className={flexBetween}>
          <h2 className="text-lg font-bold">Book Appointment</h2>
          <button type="button" onClick={onClose} className={ghostIconBtn} aria-label="Close">
            ✕
          </button>
        </div>
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onBooked(new FormData(e.currentTarget));
          }}
        >
          <div>
            <label className={labelCls} htmlFor="pbm-patient">Who is the appointment for?</label>
            <select id="pbm-patient" name="patientId" required className={inputCls} disabled={family.length === 0}>
              {family.length === 0 ? (
                <option value="">Loading…</option>
              ) : (
                <>
                  <option value="">Select…</option>
                  {family.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.first_name} {m.last_name}
                      {m.is_primary_account ? "" : ` (${(m.dependant_relationship ?? "family member").replace(/_/g, " ")})`}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="pbm-date">Date</label>
              <input id="pbm-date" name="scheduledDate" type="date" required min={new Date().toISOString().slice(0, 10)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="pbm-time">Time</label>
              <input id="pbm-time" name="startTime" type="time" required className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="pbm-type">Visit type</label>
            <select id="pbm-type" name="type" className={inputCls} defaultValue="in_person">
              <option value="in_person">In-person visit</option>
              <option value="telemedicine">Telemedicine</option>
              <option value="home_visit">Home visit</option>
              <option value="follow_up">Follow-up</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="pbm-reason">Reason</label>
            <input id="pbm-reason" name="reason" className={inputCls} placeholder="Why are you visiting?" />
          </div>
          <p className={mutedXs}>
            Your request will be submitted to the hospital — the reception team will confirm it.
          </p>
          {error && (
            <p role="alert" className={errorBanner}>
              {error}
            </p>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60">
              {busy ? "Booking…" : "Book Appointment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
