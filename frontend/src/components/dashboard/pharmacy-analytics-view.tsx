"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDownToLine, BarChart3, Package, PackageX, PiggyBank, ReceiptText, TrendingUp, Wallet, Loader2,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart,
} from "recharts";
import { formatDate, ngn } from "@/lib/auth";
import type { AccessLevel } from "@/lib/nav";

// ============================================================================
// Pharmacy Analytics — sales analytics, financial insights and reporting
// dashboards (0048/0049): top sellers, profit margins, monthly financials
// with payment-method split, wastage/loss ledger. hospital_admin / super_admin
// / pharmacist only (gated in the pharmacy page).
// ============================================================================

const btnPrimary =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60";
const card = "rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm";
const cardTitle = "flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]";

interface DashboardPayload {
  as_of?: string;
  kpi?: { total_revenue: number; total_invoices: number; cancelled: number };
  total_wastage_value?: number;
  vendor_today?: { purchased: number; paid: number; outstanding: number };
  top_drugs?: Array<{ drug_id: string; drug_name: string; category: string; qty: number; revenue: number }>;
  monthly?: { months?: Array<{ month: string; revenue: number; cost: number; profit: number; invoice_count: number; cash: number; pos: number; transfer: number; card: number; insurance: number; refunds: number }> };
  wastage_now?: Array<{ drug_name: string; reason: string; qty: number; cost_impact: number; recorded_at: string }>;
}

interface ApiErr {
  error?: string;
}

function isApiErr(x: unknown): x is ApiErr {
  return !!x && typeof x === "object" && "error" in x;
}

const PAY_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444"];
const REASON_LABEL: Record<string, string> = {
  expired: "Expired", damaged: "Damaged", theft: "Theft", other: "Other",
};

export default function PharmacyAnalyticsView({ accessLevel = "full", myRole }: { accessLevel?: AccessLevel; myRole?: string }) {
  const viewOnly = accessLevel === "view_only";
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [months, setMonths] = useState(12);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const customPeriod = fromDate !== "" && toDate !== "";

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ months: String(months) });
    if (customPeriod) {
      params.set("from", fromDate);
      params.set("to", toDate);
    }
    const res = await fetch(`/api/pharmacy/analytics/dashboard?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as ApiErr;
      setToast({ kind: "err", msg: body.error ?? "Failed to load analytics" });
      setLoading(false);
      return;
    }
    const body = (await res.json()) as { data: DashboardPayload | null };
    setData(body.data ?? null);
    setLoading(false);
  }, [months, fromDate, toDate, customPeriod]);

  useEffect(() => {
    void load();
  }, [load]);

  const monthsSeries = useMemo(() => data?.monthly?.months ?? [], [data]);
  const topDrugs = useMemo(
    () => (data?.top_drugs ?? []).map((d) => ({
      name: d.drug_name?.replace(/-\d+$/, "") ?? "—", revenue: d.revenue, qty: d.qty,
    })),
    [data],
  );
  const paySplit = useMemo(() => {
    const m = monthsSeries.reduce(
      (acc, x) => {
        acc.cash += Number(x.cash) || 0;
        acc.pos += Number(x.pos) || 0;
        acc.transfer += Number(x.transfer) || 0;
        acc.card += Number(x.card) || 0;
        acc.insurance += Number(x.insurance) || 0;
        return acc;
      },
      { cash: 0, pos: 0, transfer: 0, card: 0, insurance: 0 },
    );
    return (
      Object.entries(m)
        .map(([k, v]) => ({ key: k, name: k.charAt(0).toUpperCase() + k.slice(1), value: v }))
        .filter((r) => r.value > 0)
    );
  }, [monthsSeries]);

  const kpi = data?.kpi ?? { total_revenue: 0, total_invoices: 0, cancelled: 0 };

  const kpiCards = [
    { icon: Wallet, label: "Total Revenue", value: ngn(kpi.total_revenue ?? 0), tint: "text-emerald-600 bg-emerald-50" },
    { icon: PiggyBank, label: "Gross Profit", value: ngn(monthsSeries.reduce((a, m) => a + (Number(m.profit) || 0), 0)), tint: "text-sky-600 bg-sky-50" },
    { icon: ReceiptText, label: "Invoices", value: String(kpi.total_invoices ?? 0), tint: "text-indigo-600 bg-indigo-50" },
    { icon: TrendingUp, label: "Cancelled", value: String(kpi.cancelled ?? 0), tint: "text-amber-600 bg-amber-50" },
    { icon: PackageX, label: "Wastage Value", value: ngn(data?.total_wastage_value ?? 0), tint: "text-red-600 bg-red-50" },
    { icon: Package, label: "Purchases Today", value: ngn(data?.vendor_today?.purchased ?? 0), tint: "text-emerald-600 bg-emerald-50" },
    { icon: ArrowDownToLine, label: "Amount Paid Today", value: ngn(data?.vendor_today?.paid ?? 0), tint: "text-sky-600 bg-sky-50" },
    { icon: AlertTriangle, label: "Amount Outstanding Today", value: ngn(data?.vendor_today?.outstanding ?? 0), tint: (data?.vendor_today?.outstanding ?? 0) > 0 ? "text-rose-600 bg-rose-50" : "text-emerald-600 bg-emerald-50" },
  ];

  return (
    <div id="analytics" className="space-y-6">
      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-[var(--color-foreground)]">
              <BarChart3 className="h-5 w-5 text-[var(--color-primary)]" /> Sales Analytics &amp; Financial Insights
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
              Top sellers, profit margins, monthly performance, payment mix and stock losses.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted-fg)]">
              From
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9 rounded-lg border border-[var(--color-border)] bg-white px-2 text-xs text-[var(--color-foreground)] outline-none transition-colors duration-200 focus:border-[var(--color-primary)]"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted-fg)]">
              To
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9 rounded-lg border border-[var(--color-border)] bg-white px-2 text-xs text-[var(--color-foreground)] outline-none transition-colors duration-200 focus:border-[var(--color-primary)]"
              />
            </label>
            <select
              className={btnPrimary.replace(/px-3 py-2/, "px-2 py-2")}
              style={{ background: "transparent", color: "inherit", border: "1px solid var(--color-border)" }}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              disabled={customPeriod}
              aria-label="Analysis window"
            >
              {[1, 3, 6, 12, 24].map((m) => (
                <option key={m} value={m}>{m} month{m > 1 ? "s" : ""}</option>
              ))}
            </select>
            <button type="button" className={btnPrimary} onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
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
        <div className={card}>
          <h3 className={cardTitle}><BarChart3 className="h-4 w-4 text-[var(--color-primary)]" /> Top-Selling Drugs (revenue)</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topDrugs} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 13) + "…" : v)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                <Tooltip formatter={(v) => ngn(Number(v))} />
                <Bar dataKey="revenue" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={card}>
          <h3 className={cardTitle}><TrendingUp className="h-4 w-4 text-[var(--color-primary)]" /> Monthly Revenue / Cost / Profit</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthsSeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                <Tooltip formatter={(v) => ngn(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cost" name="Cost" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Line dataKey="profit" name="Profit" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={card}>
          <h3 className={cardTitle}><Wallet className="h-4 w-4 text-[var(--color-primary)]" /> Payment Mix (window)</h3>
          <div className="mt-4 h-64">
            {paySplit.length === 0 ? (
              <p className="mt-10 text-center text-xs text-[var(--color-muted-fg)]">No payments recorded yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paySplit} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                    {paySplit.map((r, i) => (
                      <Cell key={r.key} fill={PAY_COLORS[i % PAY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => ngn(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className={card}>
          <h3 className={cardTitle}><PackageX className="h-4 w-4 text-red-600" /> Stock Losses / Wastage</h3>
          <div className="mt-4 space-y-2">
            {(data?.wastage_now ?? []).length === 0 ? (
              <p className="text-xs text-[var(--color-muted-fg)]">No write-offs recorded in this window.</p>
            ) : (
              (data?.wastage_now ?? []).map((w) => (
                <div key={w.recorded_at + w.drug_name} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--color-foreground)]">{w.drug_name}</p>
                    <p className="text-[11px] text-[var(--color-muted-fg)]">
                      {REASON_LABEL[w.reason] ?? w.reason} · {w.qty} units · {formatDate(w.recorded_at)}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold text-red-600">{ngn(Number(w.cost_impact) || 0)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}