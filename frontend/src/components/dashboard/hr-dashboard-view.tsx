"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarDays, Clock, ShieldAlert, Users, Wallet } from "lucide-react";

const cardCls =
  "rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm";
const valueCls = "mt-1 text-2xl font-bold text-[var(--color-foreground)]";
const labelCls = "text-sm text-[var(--color-muted-fg)]";

interface Dash {
  staff: { total: number; active: number; on_leave: number; by_department: Record<string, number> };
  attendance_today: { present: number; absent: number; late: number; scheduled: number; coverage: number };
  attendance_month: { present: number; late: number; absent: number; scheduled: number; rate: number };
  leave: { pending: number; approved_month: number; balances: Array<{ name: string; type: string; entitled: number; used: number }> };
  payroll: { period: string | null; records: number; gross: number; net: number; paid: number };
  shifts: { templates: number; assigned_today: number; coverage: number };
  credentials: { expiring: Array<{ name: string; certification: string; days_left: number }>; expired: Array<{ name: string; certification: string }>; verified: number };
}

const badge = (ok: boolean) => (ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700");

export default function HrDashboardView() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/dashboard", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load HR dashboard");
      setDash(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load HR dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="py-16 text-center text-sm text-[var(--color-muted-fg)]">Loading HR dashboard…</div>;
  if (error) return <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>;

  const staff = dash?.staff;
  const today = dash?.attendance_today;
  const month = dash?.attendance_month;
  const depts = Object.entries(staff?.by_department ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className={cardCls}>
          <div className="flex items-center gap-2 text-[var(--color-muted-fg)]"><Users className="h-4 w-4" /> Staff</div>
          <div className={valueCls}>{staff?.total ?? 0}</div>
          <div className={labelCls}>{staff?.active ?? 0} active · {staff?.on_leave ?? 0} on leave</div>
        </div>
        <div className={cardCls}>
          <div className="flex items-center gap-2 text-[var(--color-muted-fg)]"><Clock className="h-4 w-4" /> Attendance today</div>
          <div className={valueCls}>{today?.present ?? 0}<span className="text-sm font-normal text-[var(--color-muted-fg)]">/{today?.scheduled ?? 0} scheduled</span></div>
          <div className={labelCls}>{today?.late ?? 0} late · {today?.absent ?? 0} absent · {today?.coverage ?? 0}% coverage</div>
        </div>
        <div className={cardCls}>
          <div className="flex items-center gap-2 text-[var(--color-muted-fg)]"><CalendarDays className="h-4 w-4" /> Month rate</div>
          <div className={valueCls}>{month?.rate ?? 0}%</div>
          <div className={labelCls}>{month?.present ?? 0} present · {month?.absent ?? 0} absent of {month?.scheduled ?? 0} scheduled</div>
        </div>
        <div className={cardCls}>
          <div className="flex items-center gap-2 text-[var(--color-muted-fg)]"><Wallet className="h-4 w-4" /> Payroll {dash?.payroll?.period ?? ""}</div>
          <div className={valueCls}>₦{(dash?.payroll?.net ?? 0).toLocaleString()}</div>
          <div className={labelCls}>{dash?.payroll?.records ?? 0} records · {dash?.payroll?.paid ?? 0} paid</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className={`${cardCls} lg:col-span-2`}>
          <h3 className="font-semibold">Compliance alerts</h3>
          <div className="mt-3 space-y-2">
            {(dash?.credentials?.expired?.length ?? 0) > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <b>{dash!.credentials!.expired!.length} expired credential(s):</b>{" "}
                  {dash!.credentials!.expired!.map((c) => `${c.name} (${c.certification})`).join(", ")}
                </div>
              </div>
            )}
            {(dash?.credentials?.expiring?.length ?? 0) > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <b>Expiring within 30 days:</b>{" "}
                  {dash!.credentials!.expiring!.map((c) => `${c.name} (${c.certification}, ${c.days_left}d)`).join(", ")}
                </div>
              </div>
            )}
            {(dash?.credentials?.expired?.length ?? 0) === 0 && (dash?.credentials?.expiring?.length ?? 0) === 0 && (
              <div className="text-sm text-[var(--color-muted-fg)]">No credential alerts. All clear.</div>
            )}
          </div>
          <h3 className="mt-6 font-semibold">Departments</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {depts.map(([d, n]) => (
              <span key={d} className="rounded-full bg-[var(--color-muted)] px-3 py-1 text-xs font-medium">
                {d} · {n}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className={cardCls}>
            <h3 className="font-semibold">Shift coverage</h3>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Templates</span><b>{dash?.shifts?.templates ?? 0}</b></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Assigned today</span><b>{dash?.shifts?.assigned_today ?? 0}</b></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Coverage</span><b>{dash?.shifts?.coverage ?? 0}%</b></div>
            </div>
          </div>
          <div className={cardCls}>
            <h3 className="font-semibold">Leave</h3>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Pending requests</span><b>{dash?.leave?.pending ?? 0}</b></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Approved this month</span><b>{dash?.leave?.approved_month ?? 0}</b></div>
            </div>
            <div className="mt-3 max-h-44 space-y-1 overflow-y-auto text-xs">
              {(dash?.leave?.balances ?? []).slice(0, 6).map((b, i) => (
                <div key={i} className="flex justify-between border-b border-[var(--color-border)] py-1">
                  <span>{b.name} · {b.type}</span>
                  <span className={badge(Number(b.used) < Number(b.entitled))}>{b.used}/{b.entitled}</span>
                </div>
              ))}
              {(dash?.leave?.balances ?? []).length === 0 && <div className="text-[var(--color-muted-fg)]">No balances yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
