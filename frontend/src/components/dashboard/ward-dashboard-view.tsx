"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Activity, BedDouble, BedSingle, Clock3, HeartPulse, Loader2, ShieldCheck, Users, Wrench,
} from "lucide-react";
import type { AccessLevel } from "@/lib/nav";
import { mutedXs, cardTitle, mutedXsMt, spinner } from "@/lib/ui-constants";

const btnPrimary =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60";

interface BedCounts {
  beds: number; available: number; occupied: number;
  maintenance: number; cleaning: number;
}

interface ForecastPayload {
  as_of?: string;
  avg_los_by_ward_type?: Record<string, number>;
  admit_rate_28d?: number;
  active?: Array<{
    admission_id: string; patient_id: string; ward_type: string | null; ward_name: string;
    bed_number: string; admitted_at: string; days_elapsed: number; projected_discharge: string | null;
  }>;
  occupancy_forecast?: Array<{ date: string; projected_active: number; expected_new: number }>;
}

export default function WardDashboardView({ accessLevel = "full", myRole }: { accessLevel?: AccessLevel; myRole?: string }) {
  const viewOnly = accessLevel === "view_only";
  const [beds, setBeds] = useState<BedCounts | null>(null);
  const [admStats, setAdmStats] = useState<{ active: number; discharged: number } | null>(null);
  const [forecast, setForecast] = useState<ForecastPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [dashRes, foreRes] = await Promise.all([
      fetch("/api/wards/dashboard", { cache: "no-store" }),
      fetch("/api/wards/forecast", { cache: "no-store" }),
    ]);
    const dash = await dashRes.json();
    const fore = await foreRes.json();
    if (!dashRes.ok) { setToast(dash.error ?? "Failed to load ward dashboard"); setLoading(false); return; }
    setBeds(dash.data?.beds ?? null);
    setAdmStats(dash.data?.admissions ?? null);
    if (foreRes.ok) setForecast(fore.data ?? null);
    else setToast(fore.error ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const occSeries = (forecast?.occupancy_forecast ?? []).map((o) => ({
    date: o.date.slice(5),
    Active: o.projected_active ?? 0,
    "Expected new": o.expected_new ?? 0,
  }));

  const stats: Array<{ icon: any; label: string; value: string; tint: string }> = [
    { icon: BedDouble, label: "Total beds", value: String(beds?.beds ?? 0), tint: "text-sky-600 bg-sky-50" },
    { icon: BedSingle, label: "Available", value: String(beds?.available ?? 0), tint: "text-emerald-600 bg-emerald-50" },
    { icon: HeartPulse, label: "Occupied", value: String(beds?.occupied ?? 0), tint: "text-indigo-600 bg-indigo-50" },
    { icon: Users, label: "Active admissions", value: String(admStats?.active ?? 0), tint: "text-amber-600 bg-amber-50" },
    { icon: Clock3, label: "Discharged", value: String(admStats?.discharged ?? 0), tint: "text-teal-600 bg-teal-50" },
    { icon: Wrench, label: "Maintenance", value: String(beds?.maintenance ?? 0), tint: "text-rose-600 bg-rose-50" },
    { icon: Activity, label: "Cleaning", value: String(beds?.cleaning ?? 0), tint: "text-orange-600 bg-orange-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-[var(--color-foreground)]">
              <ShieldCheck className="h-5 w-5 text-[var(--color-primary)]" /> Ward Dashboard
            </h2>
            <p className={mutedXsMt}>
              Live bed census, admissions movement and an AI 7-day occupancy outlook.
            </p>
          </div>
          <button onClick={() => void load()} className={btnPrimary} disabled={loading}>
            {loading ? <Loader2 className={spinner} /> : <Activity size={14} />}
            Refresh
          </button>
        </div>
        {toast && <p className="mt-3 text-xs text-rose-600">{toast}</p>}
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-[var(--color-muted-fg)]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
                <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${s.tint}`}>
                  <s.icon size={16} />
                </div>
                <p className="mt-3 text-xl font-bold text-[var(--color-foreground)]">{s.value}</p>
                <p className={mutedXs}>{s.label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold text-[var(--color-foreground)]">
                AI 7-day occupancy outlook
              </h3>
              {occSeries.length === 0 ? (
                <p className={mutedXs}>No forecast data yet.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={occSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Active" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Expected new" fill="#e0a84a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">
                Current census with projected discharge
              </h3>
              {(!forecast?.active || forecast.active.length === 0) ? (
                <p className="py-8 text-center text-xs text-[var(--color-muted-fg)]">
                  No active admissions. Admit a patient from the Admissions page.
                </p>
              ) : (
                <div className="space-y-3">
                  {forecast.active.map((a) => (
                    <div key={a.admission_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] p-3">
                      <div>
                        <p className={cardTitle}>
                          {a.ward_name} · Bed {a.bed_number}
                        </p>
                        <p className={mutedXs}>
                          {a.ward_type ?? "ward"} · {a.days_elapsed} day{a.days_elapsed === 1 ? "" : "s"} elapsed
                        </p>
                      </div>
                      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                        {a.projected_discharge ?? "Projection n/a"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}