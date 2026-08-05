"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  CalendarPlus,
  FlaskConical,
  Loader,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart as RePieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ngn, formatTime } from "@/lib/auth";
import StatusBadge from "@/components/dashboard/status-badge";

interface DashboardData {
  kpis: {
    totalPatients: number;
    todayAppointments: number;
    revenueThisMonth: number;
    pendingLabOrders: number;
  };
  profit: {
    month: string;
    revenue: number;
    medical: number;
    other: number;
    expenses: number;
    net: number;
    margin: number;
  };
  weekly: { day: string; medical: number; other: number }[];
  split: { medical: number; other: number };
  monthlyTrend: { month: string; medical: number; other: number }[];
  departments: { department: string; count: number }[];
  recentPatients: {
    id: string;
    patientNumber: string;
    name: string;
    status: string;
    createdAt: string;
  }[];
  todayAppointments: {
    id: string;
    startTime: string;
    status: string;
    reason: string | null;
    patients: { first_name: string; last_name: string; patient_number: string } | null;
  }[];
}

const CARD =
  "rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]";

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid #e4ecfc",
  fontSize: 12,
  boxShadow: "0 10px 15px rgb(0 0 0 / 0.08)",
};

export default function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard?month=${month}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load dashboard");
      setData(body.data as DashboardData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const splitData = useMemo<{ name: string; value: number; color: string }[]>(() => {
    const m = data?.split.medical ?? 0;
    const o = data?.split.other ?? 0;
    return [
      { name: "Medical services", value: m, color: "#2563eb" },
      { name: "Other income", value: o, color: "#10b981" },
    ];
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-foreground)]">
            Hospital dashboard
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
            A live overview of patients, appointments, revenue and operations.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--color-muted-fg)]">
          Period
          <input
            type="month"
            value={month}
            max={new Date().toISOString().slice(0, 7)}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="focus-ring rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-foreground)]"
            aria-label="Select month"
          />
        </label>
      </div>

      {loading && <LoadingState />}

      {error && !loading && (
        <p
          role="alert"
          className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]"
        >
          {error} —{" "}
          <button type="button" className="underline" onClick={load}>
            Retry
          </button>
        </p>
      )}

      {data && !loading && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Total patients"
              value={String(data.kpis.totalPatients)}
              hint="Registered across branches"
              icon={Users}
              gradient="bg-gradient-to-br from-sky-500 to-blue-600"
            />
            <KpiCard
              label="Today's appointments"
              value={String(data.kpis.todayAppointments)}
              hint="Scheduled for today"
              icon={CalendarDays}
              gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
            />
            <KpiCard
              label="Revenue this month"
              value={ngn(data.kpis.revenueThisMonth)}
              hint="Completed payments"
              icon={Banknote}
              gradient="bg-gradient-to-br from-amber-500 to-orange-600"
            />
            <KpiCard
              label="Pending lab orders"
              value={String(data.kpis.pendingLabOrders)}
              hint="Awaiting collection / results"
              icon={FlaskConical}
              gradient="bg-gradient-to-br from-rose-500 to-pink-600"
            />
          </div>

          <ProfitLossCard profit={data.profit} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className={`${CARD} lg:col-span-2`}>
              <CardHeader
                title="Weekly revenue breakdown"
                subtitle="Medical services + other income, last 7 days"
              />
              <div className="mt-4 h-72">
                <WeeklyChart rows={data.weekly} />
              </div>
            </section>
            <section className={CARD}>
              <CardHeader
                title="Revenue split"
                subtitle={`Medical services vs other income · ${monthLabel(data.profit.month)}`}
              />
              <div className="mt-4 h-72">
                <SplitChart data={splitData} />
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className={CARD}>
              <CardHeader
                title="Monthly revenue trend"
                subtitle="Last 12 months, ending at the selected month"
              />
              <div className="mt-4 h-72">
                <TrendChart data={data.monthlyTrend} />
              </div>
            </section>
            <section className={CARD}>
              <CardHeader
                title="Appointments by department"
                subtitle="Last 12 months, grouped by department"
              />
              <div className="mt-4 h-72">
                <DepartmentChart rows={data.departments} />
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <section className={`${CARD} xl:col-span-2`}>
              <div className="flex items-center justify-between gap-3">
                <CardHeader title="Recent patients" subtitle="Latest registrations" />
                <Link
                  href="/app/patients"
                  className="focus-ring flex shrink-0 items-center gap-1 text-sm font-medium text-[var(--color-primary)] hover:underline"
                >
                  View all <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </div>
              <RecentTable rows={data.recentPatients} />
            </section>
            <QuickActions />
          </div>

          <section className={CARD}>
            <CardHeader title="Today's schedule" subtitle="Appointments happening today" />
            <TodayList rows={data.todayAppointments} />
          </section>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-28">
      <span className="flex items-center gap-2 text-sm text-[var(--color-muted-fg)]">
        <Loader size={20} className="animate-spin" aria-hidden="true" /> Loading dashboard…
      </span>
    </div>
  );
}

function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="font-[family-name:var(--font-heading)] text-base font-semibold text-[var(--color-foreground)]">
        {title}
      </h2>
      {subtitle && <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">{subtitle}</p>}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  gradient,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ size?: number }>;
  gradient: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl p-5 text-white shadow-[var(--shadow-md)] transition-transform duration-200 hover:-translate-y-0.5">
      <div className={`absolute inset-0 ${gradient}`} aria-hidden="true" />
      <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <p className="truncate text-sm font-medium text-white/85">{label}</p>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
            <Icon size={18} />
          </span>
        </div>
        <p className="mt-2 truncate text-2xl font-bold">{value}</p>
        <p className="mt-1 text-xs text-white/75">{hint}</p>
      </div>
    </div>
  );
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric" }).format(
    new Date(y, m - 1, 1)
  );
}

// ---------------------------------------------------------------------------
// Net Profit / Loss hero card
// ---------------------------------------------------------------------------

function ProfitLossCard({ profit }: { profit: DashboardData["profit"] }) {
  const profitable = profit.net >= 0;
  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-5 text-white shadow-[var(--shadow-md)] ${
        profitable ? "border-emerald-800/50" : "border-rose-800/50"
      }`}
    >
      <div
        className={`absolute inset-0 ${
          profitable
            ? "bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800"
            : "bg-gradient-to-br from-rose-600 via-rose-700 to-red-800"
        }`}
        aria-hidden="true"
      />
      <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
      <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
            {profitable ? (
              <TrendingUp size={24} aria-hidden="true" />
            ) : (
              <TrendingDown size={24} aria-hidden="true" />
            )}
          </span>
          <div>
            <p className="text-sm text-white/80">Net profit / loss</p>
            <p className="mt-1 text-3xl font-bold">{ngn(profit.net)}</p>
            <p className="mt-1 text-xs text-white/70">
              {monthLabel(profit.month)} · margin{" "}
              <span className="font-semibold text-white/90">{profit.margin.toFixed(1)}%</span>
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-white/70">Revenue</dt>
            <dd className="mt-0.5 font-semibold">{ngn(profit.revenue)}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/70">Medical services</dt>
            <dd className="mt-0.5 font-semibold">{ngn(profit.medical)}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/70">Other income</dt>
            <dd className="mt-0.5 font-semibold">{ngn(profit.other)}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/70">Expenses</dt>
            <dd className="mt-0.5 font-semibold">{ngn(profit.expenses)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-fg)]">
      {label}
    </div>
  );
}

function WeeklyChart({ rows }: { rows: DashboardData["weekly"] }) {
  const allZero = rows.every((r) => r.medical === 0 && r.other === 0);
  if (allZero) return <EmptyChart label="No revenue in the last 7 days." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} barGap={0} barCategoryGap="20%" margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4ecfc" />
        <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e4ecfc" }} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `₦${(v / 1000).toFixed(0)}k`} width={52} />
        <Tooltip formatter={(value) => ngn(Number(value))} cursor={{ fill: "#eff6ff" }} contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12, color: "#64748b" }} />
        <Bar dataKey="medical" name="Medical services" stackId="a" fill="#2563eb" radius={[0, 0, 0, 0]} maxBarSize={40} />
        <Bar dataKey="other" name="Other income" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function SplitChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  if (data.every((d) => d.value === 0)) return <EmptyChart label="No revenue recorded this month." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RePieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={88}
          paddingAngle={3}
          dataKey="value"
          stroke="#fff"
          strokeWidth={2}
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => ngn(Number(value))} contentStyle={tooltipStyle} />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: "#475569" }}
          formatter={(value: string) => <span style={{ color: "#475569" }}>{value}</span>}
        />
      </RePieChart>
    </ResponsiveContainer>
  );
}

function TrendChart({ data }: { data: DashboardData["monthlyTrend"] }) {
  const allZero = data.every((d) => d.medical === 0 && d.other === 0);
  if (allZero) return <EmptyChart label="No revenue recorded in the last 12 months." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4ecfc" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e4ecfc" }} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `₦${(v / 1000).toFixed(0)}k`} width={52} />
        <Tooltip formatter={(value) => ngn(Number(value))} contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12, color: "#64748b" }} />
        <Line type="monotone" name="Medical services" dataKey="medical" stroke="#2563eb" strokeWidth={2} dot={{ r: 3, fill: "#2563eb" }} activeDot={{ r: 5 }} />
        <Line type="monotone" name="Other income" dataKey="other" stroke="#10b981" strokeWidth={2} dot={{ r: 2.5, fill: "#10b981" }} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function DepartmentChart({ rows }: { rows: DashboardData["departments"] }) {
  if (rows.length === 0) return <EmptyChart label="No appointments recorded." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4ecfc" />
        <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="department" tick={{ fontSize: 11, fill: "#334155" }} axisLine={{ stroke: "#e4ecfc" }} tickLine={false} width={112} />
        <Tooltip formatter={(v) => [`${v} appointments`, "Count"]} cursor={{ fill: "#eff6ff" }} contentStyle={tooltipStyle} />
        <Bar dataKey="count" name="Appointments" fill="#3b82f6" radius={[0, 6, 6, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Lists & actions
// ---------------------------------------------------------------------------

function TodayList({ rows }: { rows: DashboardData["todayAppointments"] }) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--color-muted-fg)]">
        No appointments scheduled for today.
      </p>
    );
  }
  return (
    <ul className="mt-3 divide-y divide-[var(--color-border)]">
      {rows.map((a) => {
        const patient = a.patients;
        return (
          <li key={a.id} className="flex items-center gap-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-muted)] text-xs font-bold text-[var(--color-muted-fg)]">
              {formatTime(a.startTime)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--color-foreground)]">
                {patient ? `${patient.first_name} ${patient.last_name}` : "Unknown patient"}
              </p>
              <p className="truncate text-xs text-[var(--color-muted-fg)]">
                {patient?.patient_number ?? ""}
                {a.reason ? ` · ${a.reason}` : ""}
              </p>
            </div>
            <StatusBadge status={a.status} />
          </li>
        );
      })}
    </ul>
  );
}

function RecentTable({ rows }: { rows: DashboardData["recentPatients"] }) {
  if (rows.length === 0) {
    return (
      <p className="mt-6 text-center text-sm text-[var(--color-muted-fg)]">No patients yet.</p>
    );
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted-fg)]">
            <th className="py-2.5 pr-3 font-medium">Name</th>
            <th className="py-2.5 pr-3 font-medium">Patient ID</th>
            <th className="hidden py-2.5 pr-3 font-medium sm:table-cell">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-[var(--color-border)] last:border-0">
              <td className="py-3 pr-3 font-medium text-[var(--color-foreground)]">{p.name}</td>
              <td className="py-3 pr-3 text-[var(--color-muted-fg)]">{p.patientNumber}</td>
              <td className="hidden py-3 sm:table-cell">
                <StatusBadge status={p.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuickActions() {
  const actions = [
    {
      label: "Add patient",
      href: "/app/patients",
      icon: Users,
      chip: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Schedule appointment",
      href: "/app/appointments",
      icon: CalendarPlus,
      chip: "bg-sky-50 text-sky-700",
    },
    {
      label: "Generate report",
      href: "/app/reports",
      icon: ReceiptText,
      chip: "bg-amber-50 text-amber-700",
    },
    {
      label: "View analytics",
      href: "/app/reports",
      icon: AlertTriangle,
      chip: "bg-rose-50 text-rose-700",
    },
  ];
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]">
      <CardHeader title="Quick actions" />
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <Link
            key={a.label}
            href={a.href}
            className="focus-ring flex w-full items-center gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2.5 transition-colors duration-200 hover:bg-[var(--color-muted)]"
          >
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${a.chip}`}>
              <Icon size={14} aria-hidden="true" />
            </span>
            <span className="text-sm font-medium text-[var(--color-foreground)]">{a.label}</span>
          </Link>
        );
      })}
    </section>
  );
}