"use client";

import { useMemo, useRef, useState } from "react";
import {
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  MessageSquare,
  Phone,
  User,
  Users,
} from "lucide-react";

const FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/booking-public`;

const TIME_SLOTS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

export default function BookAppointmentForm({
  tenantSlug,
  tenantName,
  branches,
}: {
  tenantSlug: string;
  tenantName: string;
  branches: { id: string; name: string }[];
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    date: "",
    time: "",
    reason: "",
    branchId: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ date: string; time: string } | null>(null);
  const dateWrapRef = useRef<HTMLDivElement>(null);
  const [dateText, setDateText] = useState("");
  const [calOpen, setCalOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const minDate = useMemo(() => new Date().toISOString().split("T")[0], []);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function formatDate(iso: string) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return d && m && y ? `${m}/${d}/${y}` : iso;
  }

  function parseDate(text: string) {
    const m = text.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (!m) return null;
    const [, mm, dd, yyyy] = m;
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (
      date.getFullYear() !== Number(yyyy) ||
      date.getMonth() !== Number(mm) - 1 ||
      date.getDate() !== Number(dd)
    ) {
      return null;
    }
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  function pickDate(iso: string) {
    set("date", iso);
    setDateText(formatDate(iso));
    setError(null);
    setCalOpen(false);
  }

  function calCells(month: Date) {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: { iso: string; day: number | null }[] = [];
    for (let i = 0; i < first.getDay(); i++) cells.push({ iso: "", day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        iso: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        day: d,
      });
    }
    return cells;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim() || !form.date || !form.time) {
      setError("Please fill in your name, phone number, preferred date and time.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantSlug,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.trim(),
          date: form.date,
          time: form.time,
          reason: form.reason.trim() || null,
          branchId: form.branchId || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Something went wrong — please call the hospital instead.");
        return;
      }
      setDone({ date: form.date, time: form.time });
    } catch {
      setError("Could not reach the booking service — please try again or call us.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-2xl shadow-[#16A34A]/10">
        <div className="relative bg-gradient-to-br from-[#16A34A] to-[#15803D] px-8 pb-8 pt-10 text-center">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#16A34A] shadow-lg tenant-success-pop">
            <CheckCircle2 size={32} />
          </span>
          <h2 className="mt-5 text-xl font-bold text-white">Booking request received</h2>
        </div>
        <div className="space-y-3 px-8 py-7">
          <p className="text-sm leading-relaxed text-slate-600">
            Thank you! We&apos;ve received your appointment request for{" "}
            <strong className="text-[#0F4C81]">
              {done.date} at {done.time}
            </strong>
            . Our team at {tenantName} will call you to confirm.
          </p>
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <Phone size={16} className="shrink-0 text-emerald-600" />
            Need help? Call us and we&apos;ll fast-track your booking.
          </div>
        </div>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3.5 text-sm text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-[color:var(--brand)] focus:ring-4 focus:ring-[color:color-mix(in_srgb,var(--brand)_18%,transparent)]";
  const selectClass =
    "w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-9 text-sm text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-[color:var(--brand)] focus:ring-4 focus:ring-[color:color-mix(in_srgb,var(--brand)_18%,transparent)]";

  function Field({
    label,
    icon,
    children,
    required,
    className = "",
  }: {
    label: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    required?: boolean;
    className?: string;
  }) {
    return (
      <div className={className}>
        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <span className="text-[color:var(--brand)]">{icon}</span>
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        {children}
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-md overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl shadow-[#0B3A63]/10 tenant-form-in"
    >
      <div className="relative border-b border-slate-100 bg-gradient-to-br from-[#0F4C81] to-[#0B3A63] px-8 py-7">
        <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[#16A34A]/25 blur-2xl" />
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white backdrop-blur-sm">
          <CalendarDays size={22} />
        </span>
        <h2 className="mt-3 text-lg font-bold text-white">Book an appointment</h2>
        <p className="mt-0.5 text-sm text-white/75">Tell us when suits you — we&apos;ll confirm by phone.</p>
      </div>

      <div className="space-y-4 px-8 py-7">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" icon={<User size={12} />} required>
            <div className="relative">
              <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className={inputClass}
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                autoComplete="given-name"
                placeholder="First name"
              />
            </div>
          </Field>
          <Field label="Last name" icon={<Users size={12} />} required>
            <div className="relative">
              <Users size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className={inputClass}
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                autoComplete="family-name"
                placeholder="Last name"
              />
            </div>
          </Field>
        </div>

        <Field label="Phone number" icon={<Phone size={12} />} required>
          <div className="relative">
            <Phone size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className={inputClass}
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              type="tel"
              autoComplete="tel"
              placeholder="e.g. 0803 123 4567"
            />
          </div>
        </Field>

        {branches.length > 0 && (
          <Field label="Branch" icon={<MapPin size={12} />}>
            <div className="relative">
              <MapPin size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select className={selectClass} value={form.branchId} onChange={(e) => set("branchId", e.target.value)}>
                <option value="">Main / any branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Preferred date" icon={<CalendarDays size={12} />} required>
            <div className="relative">
              <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className={`${inputClass} pr-24`}
                value={dateText}
                onChange={(e) => {
                  setDateText(e.target.value);
                  const parsed = parseDate(e.target.value);
                  set("date", parsed ?? "");
                  if (parsed && parsed < minDate) {
                    setError("Preferred date cannot be in the past.");
                  } else if (error === "Preferred date cannot be in the past.") {
                    setError(null);
                  }
                }}
                autoComplete="off"
                inputMode="numeric"
                placeholder="MM/DD/YYYY"
                aria-label="Preferred date"
              />
              <button
                type="button"
                onClick={() => {
                  setCalOpen((o) => !o);
                  setCalMonth((m) => {
                    const selected = form.date ? new Date(`${form.date}T00:00:00`) : null;
                    return selected ? new Date(selected.getFullYear(), selected.getMonth(), 1) : m;
                  });
                }}
                aria-label="Open calendar"
                aria-expanded={calOpen}
                className={`absolute right-1 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  calOpen
                    ? "bg-[color:var(--brand)] text-white"
                    : "text-slate-400 hover:bg-slate-100 hover:text-[color:var(--brand)]"
                }`}
              >
                <CalendarDays size={16} />
              </button>
              {calOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setCalOpen(false)} />
                  <div
                    ref={dateWrapRef}
                    className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <button
                        type="button"
                        aria-label="Previous month"
                        onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="text-sm font-semibold text-slate-700">
                        {calMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                      </span>
                      <button
                        type="button"
                        aria-label="Next month"
                        onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                    <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {WEEKDAYS.map((w) => (
                        <div key={w} className="py-1">
                          {w}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-0.5">
                      {calCells(calMonth).map((c, i) => {
                        const isPast = c.iso !== "" && c.iso < minDate;
                        const isSelected = c.iso !== "" && c.iso === form.date;
                        return (
                          <button
                            key={i}
                            type="button"
                            disabled={!c.iso || isPast}
                            onClick={() => c.iso && pickDate(c.iso)}
                            className={`flex h-9 items-center justify-center rounded-lg text-sm transition-colors ${
                              isSelected
                                ? "bg-[color:var(--brand)] font-bold text-white"
                                : isPast || !c.iso
                                  ? "cursor-not-allowed text-slate-300"
                                  : "text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {c.day ?? ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </Field>
          <Field label="Preferred time" icon={<Clock size={12} />} required>
            <div className="relative">
              <Clock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select className={selectClass} value={form.time} onChange={(e) => set("time", e.target.value)}>
                <option value="">Select time</option>
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </Field>
        </div>

        <Field label="Reason" icon={<MessageSquare size={12} />}>
          <div className="relative">
            <MessageSquare size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
            <textarea
              className={`${inputClass} resize-none`}
              rows={3}
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
              placeholder="What can we help you with?"
            />
          </div>
        </Field>

        {error && (
          <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-600 tenant-error-shake">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="group flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] disabled:translate-y-0 disabled:opacity-60 disabled:shadow-none [background:var(--brand)]"
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <CalendarCheck size={16} className="transition-transform group-hover:scale-110" />
          )}
          {busy ? "Sending request…" : "Request Appointment"}
        </button>

        <p className="text-center text-xs text-slate-400">
          We&apos;ll call you to confirm your appointment time.
        </p>
      </div>
    </form>
  );
}
