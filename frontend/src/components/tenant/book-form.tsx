"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, Loader2 } from "lucide-react";

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

  const minDate = useMemo(() => new Date().toISOString().split("T")[0], []);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
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
      <div className="mx-auto max-w-md rounded-2xl border border-emerald-100 bg-emerald-50 p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CalendarCheck size={22} />
        </span>
        <h2 className="mt-4 text-lg font-bold text-emerald-900">Booking request received</h2>
        <p className="mt-2 text-sm text-emerald-800">
          Thank you! We&apos;ve received your appointment request for{" "}
          <strong>
            {done.date} at {done.time}
          </strong>
          . Our team at {tenantName} will call you to confirm.
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--brand)_25%,transparent)]";

  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">First name *</label>
          <input
            className={inputClass}
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            autoComplete="given-name"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Last name *</label>
          <input
            className={inputClass}
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            autoComplete="family-name"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Phone number *</label>
        <input
          className={inputClass}
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
          type="tel"
          autoComplete="tel"
          placeholder="e.g. 0803 123 4567"
        />
      </div>
      {branches.length > 0 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Branch</label>
          <select className={inputClass} value={form.branchId} onChange={(e) => set("branchId", e.target.value)}>
            <option value="">Main / any branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Preferred date *</label>
          <input
            className={inputClass}
            value={form.date}
            onChange={(e) => set("date", e.target.value)}
            type="date"
            min={minDate}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Preferred time *</label>
          <select className={inputClass} value={form.time} onChange={(e) => set("time", e.target.value)}>
            <option value="">Select time</option>
            {TIME_SLOTS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Reason (optional)</label>
        <textarea
          className={`${inputClass} resize-none`}
          rows={3}
          value={form.reason}
          onChange={(e) => set("reason", e.target.value)}
          placeholder="What can we help you with?"
        />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 [background:var(--brand)]"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <CalendarCheck size={16} />}
        {busy ? "Sending request…" : "Request Appointment"}
      </button>
      <p className="text-center text-xs text-slate-400">
        We&apos;ll call you to confirm your appointment time.
      </p>
    </form>
  );
}
