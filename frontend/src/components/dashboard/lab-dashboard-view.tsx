"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ComposedChart,
} from "recharts";
import {
  BarChart3, CalendarRange, FlaskConical, Loader2, Users, Wallet, PackageSearch,
} from "lucide-react";
import { ngn } from "@/lib/auth";
import type { AccessLevel } from "@/lib/nav";
import { mutedXsMt, flexWrapGap2 } from "@/lib/ui-constants";

// ============================================================================
// Lab Dashboard — income, patients served and request metrics for a month
// (or a from/to window). Powered by lab_analytics_dashboard (0050-0054).
// ============================================================================

const btnPrimary =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60";
const inputCls =
  "h-10 rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-foreground)] outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";

interface DashboardPayload {
  as_of?: string;
  kpi?: {
    income: number; paid: number; invoices: number;
    patients: number; items: number;
  };
  monthly?: Array<{
    month: string; income: number; paid: number;
    invoices: number; patients: number; items: number;
  }>;
  top_services?: Array<{
    service_name: string; category: string; qty: number; billed: number; paid: number;
  }>;
  requests?: {
    total: number; requested: number; sample_collected: number;
    in_progress: number; completed: number; cancelled: number;
  };
}

const REQUEST_LABELS: Array<[string, string]> = [
  ["requested", "Requested"],
  ["sample_collected", "Sample collected"],
  ["in_progress", "In progress"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
];

export default function LabDashboardView({ accessLevel = "full", myRole }: { accessLevel?: AccessLevel; myRole?: string }) {
  const viewOnly = accessLevel === "view_only";
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [months, setMonths] = useState(6);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ months: String(months) });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/lab/dashboard?${params.toString()}`, { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) {
      setToast(body.error ?? "Failed to load lab dashboard");
      setLoading(false);
      return;
    }
    setData(body.data ?? null);
    setLoading(false);
  }, [months, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpi = data?.kpi ?? { income: 0, patients: 0, invoices: 0, items: 0 };
  const requests = data?.requests;
  const monthly = data?.monthly ?? [];
  const top = data?.top_services ?? [];

  const topChart = useMemo(
    () => top.slice(0, 10).map((t) => ({ name: t.service_name?.replace(/-\d+$/, "") ?? "—", billed: t.billed })),
    [top],
  );

  const kpiCards = [
    { icon: Wallet, label: "Lab income", value: ngn(kpi.income ?? 0), tint: "text-emerald-600 bg-emerald-50" },
    { icon: Users, label: "Patients served", value: String(kpi.patients ?? 0), tint: "text-sky-600 bg-sky-50" },
    { icon: FlaskConical, label: "Invoices", value: String(kpi.invoices ?? 0), tint: "text-indigo-600 bg-indigo-50" },
    { icon: PackageSearch, label: "Services billed", value: String(kpi.items ?? 0), tint: "text-amber-600 bg-amber-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-[var(--color-foreground)]">
              <BarChart3 className="h-5 w-5 text-[var(--color-primary)]" /> Lab Dashboard
            </h2>
            <p className={mutedXsMt}>
              Monthly income from lab services, patients attended and request metrics.
            </p>
          </div>
          <div className={flexWrapGap2}>
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted-fg)]">
              <CalendarRange size={13} /> From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted-fg)]">
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
            </label>
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className={inputCls}>
              {[3, 6, 12, 24].map((m) => (
                <option key={m} value={m}>{m} months</option>
              ))}
            </select>
            <button type="button" className={btnPrimary} onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
              Refresh
            </button>
          </div>
        </div>

        {toast && (
          <p role="alert" className="mt-3 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
            {toast}
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpiCards.map((c) => (
            <div key={c.label} className="rounded-xl border border-[var(--color-border)] bg-white p-3">
              <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${c.tint}`}>
                <c.icon className="h-4 w-4" />
              </div>
              <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">{c.label}</p>
              <p className="text-base font-bold text-[var(--color-foreground)]">{c.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]">
            <Wallet className="h-4 w-4 text-[var(--color-primary)]" /> Income per month (billed vs collected)
          </h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                <Tooltip formatter={(v) => ngn(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line dataKey="paid" name="Collected" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                <Line dataKey="income" name="Billed" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]">
            <Users className="h-4 w-4 text-[var(--color-primary)]" /> Patients attended per month
          </h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="patients" name="Patients" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="invoices" name="Invoices" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]">
            <FlaskConical className="h-4 w-4 text-[var(--color-primary)]" /> Lab Requests (window)
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {REQUEST_LABELS.map(([k, l]) => (
              <div key={k} className="rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-center">
                <p className="text-lg font-bold text-[var(--color-foreground)]">{Number(requests?.[k as keyof typeof requests] ?? 0)}</p>
                <p className="text-[10px] font-semibold uppercase text-[var(--color-muted-fg)]">{l}</p>
              </div>
            ))}
            <div className="rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-[var(--color-primary-dark)]">{requests?.total ?? 0}</p>
              <p className="text-[10px] font-semibold uppercase text-[var(--color-muted-fg)]">Total</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]">
            <BarChart3 className="h-4 w-4 text-[var(--color-primary)]" /> Top services by income
          </h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 13) + "…" : v)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                <Tooltip formatter={(v) => ngn(Number(v))} />
                <Bar dataKey="billed" name="Income" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}