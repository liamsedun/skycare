"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Clock,
  LayoutDashboard,
  ShieldAlert,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import FilterBar from "@/components/filters/filter-bar";

const C = { sky: "#0ea5e9", emerald: "#10b981", amber: "#f59e0b", rose: "#f43f5e", violet: "#8b5cf6" };

const panelCls =
  "rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md";

const labelCls = "text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]";

interface Dash {
  staff: { total: number; active: number; on_leave: number; by_department: Record<string, number> };
  attendance_today: { present: number; absent: number; late: number; scheduled: number; coverage: number };
  attendance_month: { present: number; late: number; absent: number; scheduled: number; rate: number };
  leave: { pending: number; approved_month: number; balances: Array<{ name: string; type: string; entitled: number; used: number }> };
  payroll: { period: string | null; records: number; gross: number; net: number; paid: number };
  shifts: { templates: number; assigned_today: number; coverage: number };
  credentials: { expiring: Array<{ name: string; certification: string; days_left: number }>; expired: Array<{ name: string; certification: string }>; verified: number };
}

const LEAVE_TYPES = ["annual", "sick", "emergency", "study", "maternity", "paternity", "unpaid"] as const;
const LEAVE_LABELS: Record<string, string> = {
  annual: "Annual",
  sick: "Sick",
  emergency: "Emergency",
  study: "Study",
  maternity: "Maternity",
  paternity: "Paternity",
  unpaid: "Unpaid",
};
const LEAVE_TINTS: Record<string, string> = {
  annual: C.sky,
  sick: C.amber,
  emergency: C.rose,
  study: C.violet,
  maternity: C.emerald,
  paternity: "#06b6d4",
  unpaid: "#94a3b8",
};

function KpiCard({ icon: Icon, tint, label, value, sub, valueCls = "" }: { icon: typeof Users; tint: string; label: string; value: ReactNode; sub?: ReactNode; valueCls?: string }) {
  return (
    <div className={panelCls}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${tint}1a`, color: tint }}>
          <Icon size={18} />
        </span>
      </div>
      <div className={`mt-2 text-2xl font-bold text-[var(--color-foreground)] ${valueCls}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-[var(--color-muted-fg)]">{sub}</div>}
    </div>
  );
}

function Donut({ data, colors, center, centerSub }: { data: Array<{ name: string; value: number }>; colors: string[]; center: string; centerSub?: string }) {
  return (
    <div className="relative h-40">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={64} paddingAngle={3} strokeWidth={0}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => [String(v ?? 0), "staff"]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-[var(--color-foreground)]">{center}</span>
        {centerSub && <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">{centerSub}</span>}
      </div>
    </div>
  );
}

function Ring({ pct, label }: { pct: number; label: string }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex flex-col items-center">
      <div
        className="flex h-28 w-28 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(${C.sky} ${v * 3.6}deg, rgba(148,163,184,.25) 0deg)` }}
      >
        <div className="flex h-[78px] w-[78px] flex-col items-center justify-center rounded-full bg-white">
          <span className="text-xl font-bold text-[var(--color-foreground)]">{Math.round(v)}%</span>
        </div>
      </div>
      <span className="mt-2 text-xs text-[var(--color-muted-fg)]">{label}</span>
    </div>
  );
}

export default function HrDashboardView() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [attSeries, setAttSeries] = useState<Array<{ day: string; present: number; late: number; absent: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [policy, setPolicy] = useState<Array<{ leave_type: string; entitled_days: number }> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [policySaving, setPolicySaving] = useState(false);
  const [policyMsg, setPolicyMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      const [dashRes, meRes, attRes] = await Promise.all([
        fetch(`/api/hr/dashboard${qs ? `?${qs}` : ""}`, { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch(`/api/hr/attendance?month=${new Date().toISOString().slice(0, 7)}`, { cache: "no-store" }),
      ]);
      const dashBody = await dashRes.json();
      if (!dashRes.ok) throw new Error(dashBody.error ?? "Failed to load HR dashboard");
      setDash(dashBody.data);

      const me = await meRes.json();
      const role = me.data?.claims?.role as string | undefined;
      const admin = !!role && ["hospital_admin", "hr_officer", "super_admin"].includes(role);
      setIsAdmin(admin);

      const att = await attRes.json();
      const byDay = new Map<string, { present: number; late: number; absent: number }>();
      for (const r of (att.data ?? []) as Array<{ work_date: string; status?: string }>) {
        const d = (r.work_date ?? "").slice(5, 10);
        const x = byDay.get(d) ?? { present: 0, late: 0, absent: 0 };
        const st = r.status ?? "";
        if (st === "present" || st === "late") x[st === "late" ? "late" : "present"]++;
        else if (st === "absent") x.absent++;
        byDay.set(d, x);
      }
      setAttSeries([...byDay.entries()].slice(-14).map(([day, v]) => ({ day, ...v })));

      if (admin) {
        const pol = await fetch("/api/hr/leave-policy", { cache: "no-store" }).then((r) => r.json());
        if (pol.data?.rows) {
          setPolicy(pol.data.rows);
          setDraft(Object.fromEntries(pol.data.rows.map((r: { leave_type: string; entitled_days: number }) => [r.leave_type, String(r.entitled_days)])));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load HR dashboard");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const savePolicy = async () => {
    if (!policy) return;
    setPolicySaving(true);
    setPolicyMsg(null);
    try {
      const days = Object.fromEntries(LEAVE_TYPES.map((t) => [t, Number(draft[t] ?? 0)]));
      const res = await fetch("/api/hr/leave-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save leave policy");
      setPolicy(body.data.rows);
      setDraft(Object.fromEntries(body.data.rows.map((r: { leave_type: string; entitled_days: number }) => [r.leave_type, String(r.entitled_days)])));
      setPolicyMsg({ ok: true, text: "Leave policy saved — balances updated for the current year" });
      void load();
    } catch (e) {
      setPolicyMsg({ ok: false, text: e instanceof Error ? e.message : "Failed to save leave policy" });
    } finally {
      setPolicySaving(false);
    }
  };

  if (loading) return <div className="py-16 text-center text-sm text-[var(--color-muted-fg)]">Loading HR dashboard…</div>;
  if (error) return <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>;

  const staff = dash?.staff;
  const today = dash?.attendance_today;
  const month = dash?.attendance_month;
  const periodActive = Boolean(from || to);
  const q = search.trim().toLowerCase();

  const expired = (dash?.credentials?.expired ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.certification.toLowerCase().includes(q));
  const expiring = (dash?.credentials?.expiring ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.certification.toLowerCase().includes(q));
  const depts = Object.entries(staff?.by_department ?? {}).sort((a, b) => b[1] - a[1]).filter(([d]) => !q || d.toLowerCase().includes(q));
  const balances = (dash?.leave?.balances ?? []).filter((b) => !q || b.name.toLowerCase().includes(q) || b.type.toLowerCase().includes(q));

  const attData = [
    { name: "Present", value: today?.present ?? 0 },
    { name: "Late", value: today?.late ?? 0 },
    { name: "Absent", value: today?.absent ?? 0 },
  ].filter((d) => d.value > 0);
  const attTotal = attData.reduce((s, d) => s + d.value, 0);

  const deptData = depts.slice(0, 8).map(([name, n]) => ({ name: name.length > 14 ? name.slice(0, 13) + "…" : name, value: n }));

  const usedTotal = balances.reduce((s, b) => s + Number(b.used), 0);
  const entTotal = balances.reduce((s, b) => s + Number(b.entitled), 0);
  const leaveData = [
    { name: "Used", value: usedTotal },
    { name: "Remaining", value: Math.max(0, entTotal - usedTotal) },
  ].filter((d) => d.value > 0);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
        <FilterBar
          query={search}
          onQueryChange={setSearch}
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          onClear={() => { setSearch(""); setFrom(""); setTo(""); }}
          searchPlaceholder="Search alerts, departments, leave…"
          searchWidth={280}
        />
        <p className="mt-2 text-xs text-[var(--color-muted-fg)]">
          {periodActive ? "Attendance and leave figures below cover the selected period." : "Attendance and leave figures cover the current month."}
        </p>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-[var(--color-primary)]/20 p-6 shadow-sm" style={{ background: "linear-gradient(120deg, rgba(14,165,233,.14), rgba(139,92,246,.10) 55%, rgba(255,255,255,0))" }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-primary)]">{new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
            <h2 className="mt-1 text-2xl font-bold text-[var(--color-foreground)]">{greeting}, HR Team</h2>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white/80 px-3 py-1 font-medium text-[var(--color-foreground)] ring-1 ring-[var(--color-border)]">{staff?.active ?? 0} active staff</span>
              <span className="rounded-full bg-white/80 px-3 py-1 font-medium text-[var(--color-foreground)] ring-1 ring-[var(--color-border)]">{today?.coverage ?? 0}% shift coverage today</span>
              <span className="rounded-full bg-white/80 px-3 py-1 font-medium text-[var(--color-foreground)] ring-1 ring-[var(--color-border)]">{dash?.leave?.pending ?? 0} pending leave</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/app/hr/staff" className="inline-flex items-center gap-1 rounded-xl bg-white px-4 py-2 text-sm font-medium text-[var(--color-foreground)] shadow-sm ring-1 ring-[var(--color-border)] transition-all hover:-translate-y-0.5 hover:shadow-md">
              <UserCog size={15} /> Staff profiles <ArrowUpRight size={13} />
            </Link>
            <Link href="/app/hr/roster" className="inline-flex items-center gap-1 rounded-xl bg-white px-4 py-2 text-sm font-medium text-[var(--color-foreground)] shadow-sm ring-1 ring-[var(--color-border)] transition-all hover:-translate-y-0.5 hover:shadow-md">
              <LayoutDashboard size={15} /> Shifts &amp; roster <ArrowUpRight size={13} />
            </Link>
            <Link href="/app/hr/payroll" className="inline-flex items-center gap-1 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:-translate-y-0.5 hover:opacity-90 hover:shadow-md">
              <Wallet size={15} /> Payroll <ArrowUpRight size={13} />
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard icon={Users} tint={C.sky} label="Staff" value={staff?.total ?? 0} sub={`${staff?.active ?? 0} active · ${staff?.on_leave ?? 0} on leave`} />
        <KpiCard icon={Clock} tint={C.emerald} label="Attendance today" value={`${today?.present ?? 0}/${today?.scheduled ?? 0}`} sub={`${today?.late ?? 0} late · ${today?.absent ?? 0} absent`} />
        <KpiCard icon={TrendingUp} tint={C.amber} label={periodActive ? "Period rate" : "Month rate"} value={`${month?.rate ?? 0}%`} sub={`${month?.present ?? 0} present · ${month?.absent ?? 0} absent`} valueCls="text-emerald-600" />
        <KpiCard icon={Wallet} tint={C.violet} label={`Payroll ${dash?.payroll?.period ?? ""}`} value={`₦${(dash?.payroll?.net ?? 0).toLocaleString()}`} sub={`${dash?.payroll?.records ?? 0} records · ${dash?.payroll?.paid ?? 0} paid`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className={`${panelCls} lg:col-span-1`}>
          <h3 className="font-semibold text-[var(--color-foreground)]">Attendance today</h3>
          {attTotal > 0 ? (
            <>
              <Donut data={attData} colors={[C.emerald, C.amber, C.rose]} center={String(today?.coverage ?? 0) + "%"} centerSub="coverage" />
              <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs text-[var(--color-muted-fg)]">
                {attData.map((d) => (
                  <span key={d.name} className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: { Present: C.emerald, Late: C.amber, Absent: C.rose }[d.name] }} />
                    {d.name} · {d.value}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-6 text-center text-sm text-[var(--color-muted-fg)]">No check-ins recorded today yet.</p>
          )}
          <h3 className="mt-5 font-semibold text-[var(--color-foreground)]">Shift coverage</h3>
          <div className="mt-3 flex items-center justify-center gap-6">
            <Ring pct={dash?.shifts?.coverage ?? 0} label="Reports covered" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-6"><span className="text-[var(--color-muted-fg)]">Templates</span><b>{dash?.shifts?.templates ?? 0}</b></div>
              <div className="flex justify-between gap-6"><span className="text-[var(--color-muted-fg)]">Assigned today</span><b>{dash?.shifts?.assigned_today ?? 0}</b></div>
            </div>
          </div>
        </div>

        <div className={`${panelCls} lg:col-span-1`}>
          <h3 className="font-semibold text-[var(--color-foreground)]">Departments</h3>
          {deptData.length > 0 ? (
            <div className="mt-3 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,.25)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={46} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "rgba(14,165,233,.08)" }} />
                  <Bar dataKey="value" name="Staff" radius={[6, 6, 0, 0]} maxBarSize={34}>
                    {deptData.map((_, i) => (
                      <Cell key={i} fill={[C.sky, C.violet, C.emerald, C.amber][i % 4]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-6 text-center text-sm text-[var(--color-muted-fg)]">No departments recorded yet.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {depts.slice(0, 10).map(([d, n]) => (
              <span key={d} className="rounded-full bg-[var(--color-muted)] px-2.5 py-0.5 text-[11px] font-medium">{d} · {n}</span>
            ))}
            {depts.length === 0 && <span className="text-xs text-[var(--color-muted-fg)]">No departments match this search.</span>}
          </div>
        </div>

        <div className={`${panelCls} lg:col-span-1`}>
          <h3 className="font-semibold text-[var(--color-foreground)]">Leave usage</h3>
          <div className="mt-2">
            {entTotal > 0 ? (
              <>
                <Donut data={leaveData} colors={[C.amber, C.sky]} center={`${usedTotal}`} centerSub="days used" />
                <div className="mt-1 flex justify-center gap-3 text-xs text-[var(--color-muted-fg)]">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: C.amber }} /> Used · {usedTotal}</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: C.sky }} /> Remaining · {Math.max(0, entTotal - usedTotal)}</span>
                </div>
              </>
            ) : (
              <p className="mt-6 text-center text-sm text-[var(--color-muted-fg)]">No leave balances yet.</p>
            )}
          </div>
          <div className="mt-3 max-h-44 space-y-1.5 overflow-y-auto text-xs">
            {balances.slice(0, 6).map((b, i) => {
              const pct = Number(b.entitled) > 0 ? Math.min(100, (Number(b.used) / Number(b.entitled)) * 100) : 0;
              return (
                <div key={i}>
                  <div className="flex justify-between">
                    <span className="truncate">{b.name} · {b.type}</span>
                    <span className="shrink-0 text-[var(--color-muted-fg)]">{b.used}/{b.entitled}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: LEAVE_TINTS[b.type] ?? C.sky }} />
                  </div>
                </div>
              );
            })}
            {balances.length === 0 && <div className="text-[var(--color-muted-fg)]">No balances yet.</div>}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className={panelCls}>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-[var(--color-foreground)]">Compliance alerts</h3>
            <span className="rounded-full bg-[var(--color-muted)] px-2.5 py-0.5 text-xs font-medium">{(dash?.credentials?.verified ?? 0) + expired.length + expiring.length} credential events</span>
          </div>
          <div className="mt-3 space-y-2">
            {expired.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <b>{expired.length} expired credential(s):</b>{" "}
                  {expired.map((c) => `${c.name} (${c.certification})`).join(", ")}
                </div>
              </div>
            )}
            {expiring.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <b>Expiring within 30 days:</b>{" "}
                  {expiring.map((c) => `${c.name} (${c.certification}, ${c.days_left}d)`).join(", ")}
                </div>
              </div>
            )}
            {expired.length === 0 && expiring.length === 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
                <b>All credentials verified.</b> No expiry alerts in the next 30 days.
              </div>
            )}
          </div>

          <h3 className="mt-5 font-semibold text-[var(--color-foreground)]">Leave requests</h3>
          <div className="mt-2 flex gap-3">
            <div className="flex-1 rounded-xl border border-[var(--color-border)] px-3 py-2.5">
              <span className={labelCls}>Pending</span>
              <div className="text-lg font-bold text-[var(--color-foreground)]">{dash?.leave?.pending ?? 0}</div>
            </div>
            <div className="flex-1 rounded-xl border border-[var(--color-border)] px-3 py-2.5">
              <span className={labelCls}>{periodActive ? "Approved in period" : "Approved this month"}</span>
              <div className="text-lg font-bold text-emerald-600">{dash?.leave?.approved_month ?? 0}</div>
            </div>
          </div>
        </div>

        <div className={`${panelCls} lg:col-span-1`}>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-[var(--color-foreground)]">Attendance pulse <span className="text-xs font-normal text-[var(--color-muted-fg)]">· last 14 days</span></h3>
            <CalendarDays className="h-4 w-4 text-[var(--color-muted-fg)]" />
          </div>
          {attSeries.length > 0 ? (
            <div className="mt-3 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attSeries} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,.25)" />
                  <XAxis dataKey="day" tick={{ fontSize: 9 }} interval={1} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "rgba(14,165,233,.08)" }} />
                  <Bar dataKey="present" name="Present" stackId="a" fill={C.emerald} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="late" name="Late" stackId="a" fill={C.amber} />
                  <Bar dataKey="absent" name="Absent" stackId="a" fill={C.rose} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-8 text-center text-sm text-[var(--color-muted-fg)]">No attendance records for this month yet.</p>
          )}
          <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs text-[var(--color-muted-fg)]">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: C.emerald }} /> Present</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: C.amber }} /> Late</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: C.rose }} /> Absent</span>
          </div>
        </div>
      </div>

      {isAdmin && policy && (
        <div className={panelCls}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-[var(--color-foreground)]">Annual leave entitlements</h3>
              <p className="text-xs text-[var(--color-muted-fg)]">Set how many days each staff member can claim per leave type per year. Saving re-syncs every staff member's balances (used days are kept).</p>
            </div>
            {policyMsg && (
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${policyMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{policyMsg.text}</span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
            {LEAVE_TYPES.map((t) => (
              <div key={t} className="rounded-xl border border-[var(--color-border)] p-3">
                <label className={labelCls} style={{ color: LEAVE_TINTS[t] }}>{LEAVE_LABELS[t]}</label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-2 text-sm font-semibold outline-none transition-colors focus:border-[var(--color-primary)]"
                  value={draft[t] ?? "0"}
                  onChange={(e) => setDraft({ ...draft, [t]: e.target.value })}
                />
                <span className="text-[10px] text-[var(--color-muted-fg)]">days / year</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => void savePolicy()}
            disabled={policySaving}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
          >
            {policySaving ? "Saving…" : "Save leave policy"}
          </button>
        </div>
      )}
    </div>
  );
}