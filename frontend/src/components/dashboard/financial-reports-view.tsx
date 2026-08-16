"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BedDouble,
  CalendarRange,
  Download,
  Landmark,
  Loader2,
  PieChart as PieIcon,
  Printer,
  ReceiptText,
  ShoppingCart,
  Stethoscope,
  TestTube2,
  Wallet,
  Layers,
} from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ngn } from "@/lib/auth";

const inputCls =
  "focus-ring h-10 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-foreground)] outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";

interface ModuleIncome {
  invoiced: number;
  collected: number;
  outstanding: number;
  count: number;
}

interface FinancialSummary {
  range: { from: string; to: string };
  income: {
    medical: ModuleIncome;
    ward: ModuleIncome;
    lab: ModuleIncome;
    pharmacy: ModuleIncome;
    other: ModuleIncome;
    totals: ModuleIncome;
  };
  expenses: {
    general: { total: number; count: number; byCategory: Array<{ category: string; amount: number }> };
    payroll: {
      total: number;
      gross: number;
      net: number;
      statutory: number;
      count: number;
      byDepartment: Array<{ department: string; gross: number; net: number; count: number }>;
    };
    stock: { total: number; count: number };
    total: number;
  };
  pnl: {
    incomeCollected: number;
    incomeInvoiced: number;
    expensesTotal: number;
    netCollected: number;
    netInvoiced: number;
    marginCollected: number;
    marginInvoiced: number;
  };
}

interface OrgInfo {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  logo_url: string | null;
  website: string | null;
}

const CHART_COLORS = ["#2563eb", "#14b8a6", "#8b5cf6", "#f59e0b", "#ec4899"];

const MODULE_META: Array<{ key: keyof FinancialSummary["income"]; label: string; icon: typeof Stethoscope; tint: string; bar: string }> = [
  { key: "medical", label: "Medical Services", icon: Stethoscope, tint: "bg-blue-50 text-blue-600", bar: "#2563eb" },
  { key: "ward", label: "Ward (Admissions)", icon: BedDouble, tint: "bg-teal-50 text-teal-600", bar: "#14b8a6" },
  { key: "lab", label: "Laboratory", icon: TestTube2, tint: "bg-violet-50 text-violet-600", bar: "#8b5cf6" },
  { key: "pharmacy", label: "Pharmacy", icon: ShoppingCart, tint: "bg-amber-50 text-amber-600", bar: "#f59e0b" },
  { key: "other", label: "Other Income", icon: Banknote, tint: "bg-pink-50 text-pink-600", bar: "#ec4899" },
];

function fmtPeriodDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function escapeCsv(val: string | number): string {
  const s = String(val);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: string[][]) {
  const bom = "\uFEFF";
  const csv = bom + rows.map((r) => r.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function FinancialReportsView() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  }, [month]);

  // Every calendar month the user selects, reset the P&L window to that month.
  useEffect(() => {
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    setFrom(`${y}-${String(m).padStart(2, "0")}-01`);
    setTo(`${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`);
  }, [month]);

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/financial/summary?from=${from}&to=${to}`, { cache: "no-store" }),
      fetch("/api/tenant/branding", { cache: "no-store" }),
    ])
      .then(async ([res, orgRes]) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load financial report");
        setSummary(body.data as FinancialSummary);
        const orgBody = await orgRes.json();
        if (orgRes.ok) setOrgInfo((orgBody.data ?? null) as OrgInfo | null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load financial report"))
      .finally(() => setLoading(false));
  }, [from, to]);

  const moduleRows = useMemo(() => {
    if (!summary) return [];
    return MODULE_META.map((m) => {
      const Icon = m.icon;
      return {
        key: m.key,
        label: m.label,
        icon: Icon,
        tint: m.tint,
        bar: m.bar,
        ...summary.income[m.key],
      };
    });
  }, [summary]);

  const incomePie = useMemo(() => {
    if (!summary) return [];
    return MODULE_META.map((m, i) => ({
      name: m.label,
      value: summary.income[m.key].collected,
      color: CHART_COLORS[i % CHART_COLORS.length],
    })).filter((d) => d.value > 0);
  }, [summary]);

  const collectedVsInvoiced = useMemo(() => {
    if (!summary) return [];
    return MODULE_META.map((m) => ({
      name: m.label.split(" ")[0],
      collected: summary.income[m.key].collected,
      invoiced: summary.income[m.key].invoiced,
    }));
  }, [summary]);

  const kpiCards = useMemo(() => {
    if (!summary) return [];
    const p = summary.pnl;
    const t = summary.income.totals;
    return [
      {
        label: "Total Income Collected",
        value: ngn(p.incomeCollected),
        sub: `${t.count} transactions`,
        icon: Wallet,
        tint: "from-emerald-500 to-teal-600",
        accent: "text-emerald-600",
        up: true,
      },
      {
        label: "Invoiced (Earned)",
        value: ngn(p.incomeInvoiced),
        sub: `${ngn(t.outstanding)} outstanding`,
        icon: ReceiptText,
        tint: "from-blue-500 to-indigo-600",
        accent: "text-blue-600",
        up: true,
      },
      {
        label: "Total Expenses",
        value: ngn(p.expensesTotal),
        sub: `payroll ${ngn(summary.expenses.payroll.total)} · stock ${ngn(summary.expenses.stock.total)} · general ${ngn(summary.expenses.general.total)}`,
        icon: Landmark,
        tint: "from-rose-500 to-pink-600",
        accent: "text-rose-600",
        up: false,
      },
      {
        label: "Net (Collected)",
        value: ngn(p.netCollected),
        sub: `${p.marginCollected.toFixed(1)}% margin · invoiced basis ${ngn(p.netInvoiced)}`,
        icon: PieIcon,
        tint: p.netCollected >= 0 ? "from-amber-500 to-orange-600" : "from-rose-500 to-red-600",
        accent: p.netCollected >= 0 ? "text-emerald-600" : "text-rose-600",
        up: p.netCollected >= 0,
      },
    ];
  }, [summary]);

  const exportCsv = useCallback(() => {
    if (!summary) return;
    const rows: string[][] = [
      [`${orgInfo?.name ?? "SkyCare"} — Consolidated Financial Report`],
      ["Generated", new Date().toLocaleString()],
      ["Period", `From ${fmtPeriodDate(summary.range.from)} to ${fmtPeriodDate(summary.range.to)}`],
      [""],
      ["INCOME BY MODULE"],
      ["Module", "Invoiced", "Collected", "Outstanding", "Count"],
      ...MODULE_META.map((m) => {
        const d = summary.income[m.key];
        return [m.label, String(d.invoiced), String(d.collected), String(d.outstanding), String(d.count)];
      }),
      ["All modules", String(summary.income.totals.invoiced), String(summary.income.totals.collected), String(summary.income.totals.outstanding), String(summary.income.totals.count)],
      [""],
      ["EXPENSES"],
      ["Category", "Amount"],
      ...summary.expenses.general.byCategory.map((c) => [c.category, String(c.amount)]),
      ["Payroll (net paid)", String(summary.expenses.payroll.total)],
      ["  · by department", ""],
      ...summary.expenses.payroll.byDepartment.map((d) => [`    ${d.department}`, String(d.net)]),
      ["Stock purchases", String(summary.expenses.stock.total)],
      ["Total expenses", String(summary.expenses.total)],
      [""],
      ["PROFIT AND LOSS (COLLECTED BASIS)"],
      ["Total income (collected)", String(summary.pnl.incomeCollected)],
      ["Total income (invoiced)", String(summary.pnl.incomeInvoiced)],
      ["Total expenses", String(summary.pnl.expensesTotal)],
      ["Net (collected)", String(summary.pnl.netCollected)],
      ["Net (invoiced)", String(summary.pnl.netInvoiced)],
      ["Margin (collected)", `${summary.pnl.marginCollected.toFixed(1)}%`],
    ];
    downloadCsv(`financial-report-${new Date().toISOString().split("T")[0]}.csv`, rows);
  }, [summary, orgInfo]);

  const printPnl = useCallback(() => {
    if (!summary) return;
    const orgAddress = [orgInfo?.address, [orgInfo?.city, orgInfo?.state].filter(Boolean).join(", "), orgInfo?.country].filter(Boolean).join(", ");
    const contact = [orgInfo?.phone && `Tel: ${orgInfo.phone}`, orgInfo?.email && `Email: ${orgInfo.email}`, orgInfo?.website].filter(Boolean).join(" • ");
    const incomeRows = MODULE_META.map((m) => [
      m.label,
      summary.income[m.key].invoiced,
      summary.income[m.key].collected,
      summary.income[m.key].outstanding,
    ] as [string, number, number, number]);
    const expRows: Array<[string, number, string?]> = [
      ...summary.expenses.general.byCategory.map((c) => [c.category, c.amount] as [string, number]),
      ["Payroll (net paid, by department)", summary.expenses.payroll.total],
      ...summary.expenses.payroll.byDepartment.map((d) => [`  ${d.department}`, d.net, "sub"] as [string, number, string]),
      ["Stock purchases (supplier payments)", summary.expenses.stock.total],
      ["Total Expenses", summary.expenses.total, "bold"],
    ];
    const netAmt = summary.pnl.netCollected;
    const buildTable = (header: string[], rowsHtml: string) =>
      `<h2 class="sec">${header[0]}</h2><table><thead><tr>${header.slice(1).map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
    const incomeTable = buildTable(
      ["A. INCOME BY MODULE", "Module", "Invoiced (N)", "Collected (N)", "Outstanding (N)"],
      incomeRows.map((r) => `<tr><td>${r[0]}</td><td class="amt">${ngn(r[1])}</td><td class="amt">${ngn(r[2])}</td><td class="amt">${ngn(r[3])}</td></tr>`).join("") +
        `<tr class="b"><td>Total</td><td class="amt">${ngn(summary.income.totals.invoiced)}</td><td class="amt">${ngn(summary.income.totals.collected)}</td><td class="amt">${ngn(summary.income.totals.outstanding)}</td></tr>`
    );
    const expTable = buildTable(
      ["B. EXPENSES", "Item", "Amount (N)"],
      expRows.map((r: any) => `<tr${r[2] === "bold" ? ' class="b"' : r[2] === "sub" ? ' class="sub"' : ""}><td>${r[0]}</td><td class="amt">${ngn(r[1])}</td></tr>`).join("")
    );
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Consolidated Financial Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; margin: 0; padding: 40px; background: #fff; }
  .header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
  .logo { width: 56px; height: 56px; object-fit: contain; }
  .logo-fallback { width: 56px; height: 56px; border-radius: 8px; background: #e0f2fe; border: 1px solid #bae6fd; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 20px; color: #0369a1; }
  h1 { font-size: 16px; margin: 0; text-transform: uppercase; }
  .sub { font-size: 11px; color: #555; margin-top: 2px; }
  .contact { font-size: 10px; color: #777; margin-top: 2px; }
  .title { text-align: center; margin-bottom: 24px; }
  .title p:first-child { font-size: 17px; font-weight: 700; margin: 0; }
  .title p:last-child { font-size: 11px; color: #555; margin: 4px 0 0; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #ccc; font-size: 13px; margin-bottom: 28px; }
  thead th { background: #f2f6fc; border-bottom: 2px solid #cbd9f2; text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase; }
  tr { border-bottom: 1px solid #eee; }
  tr.b { background: #f5f5f5; font-weight: 700; }
  tr.sub td { font-size: 12px; color: #444; padding-left: 24px; }
  td, th { padding: 8px 12px; }
  td.amt, th.amt { text-align: right; }
  .sec { font-size: 13px; text-transform: uppercase; letter-spacing: .4px; }
  .net { margin-top: 8px; font-size: 14px; font-weight: 800; }
  .net span { float: right; }
  @media print { body { padding: 20px; } }
</style></head><body>
  <div class="header">
    ${orgInfo?.logo_url ? `<img class="logo" src="${orgInfo.logo_url}" alt="logo" />` : `<div class="logo-fallback">${(orgInfo?.name || "S")[0]}</div>`}
    <div>
      <h1>${orgInfo?.name || "Hospital"}</h1>
      ${orgAddress ? `<p class="sub">${orgAddress}</p>` : ""}
      ${contact ? `<p class="contact">${contact}</p>` : ""}
    </div>
  </div>
  <div class="title">
    <p>CONSOLIDATED FINANCIAL REPORT</p>
    <p>For the period from ${fmtPeriodDate(summary.range.from)} to ${fmtPeriodDate(summary.range.to)}</p>
  </div>
  ${incomeTable}
  ${expTable}
  <div class="net">NET PROFIT/(LOSS) FOR THE PERIOD (COLLECTED BASIS) <span>${ngn(netAmt)}</span></div>
  <script>window.onload = function(){ window.print(); };</script>
</body></html>`);
    w.document.close();
  }, [summary, orgInfo]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Financial Report</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
            Whole-hospital income &amp; expenses — medical services, ward, lab, pharmacy, other income, payroll and general expenses.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <CalendarRange size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              aria-label="Reporting period"
              className={inputCls + " pl-9"}
            />
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]"
          >
            <Download size={15} aria-hidden="true" /> Export CSV
          </button>
          <button
            type="button"
            onClick={printPnl}
            className="focus-ring inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium transition-colors duration-200 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            <Printer size={15} aria-hidden="true" /> Print Report
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={24} aria-hidden="true" className="animate-spin text-[var(--color-muted-fg)]" />
        </div>
      ) : summary ? (
        <>
          {/* Hero KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpiCards.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div key={kpi.label} className="group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]">
                  <div className={`pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br ${kpi.tint} opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-20`} />
                  <div className="relative flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-muted-fg)]">{kpi.label}</p>
                      <p className="mt-1.5 truncate text-2xl font-bold tracking-tight text-[var(--color-foreground)]">{kpi.value}</p>
                      <p className="mt-2 flex items-center gap-1 text-xs">
                        <span className={`flex items-center gap-0.5 font-semibold ${kpi.accent}`}>
                          {kpi.up ? <ArrowUpRight size={13} aria-hidden="true" /> : <ArrowDownRight size={13} aria-hidden="true" />}
                          {kpi.sub}
                        </span>
                      </p>
                    </div>
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${kpi.tint} text-white shadow-sm`}>
                      <Icon size={20} aria-hidden="true" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Module income section */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)] lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-foreground)]">
                    <Layers size={16} aria-hidden="true" className="text-[var(--color-primary)]" /> Income by Module
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">Collected vs invoiced vs outstanding, per revenue stream</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                      <th className="py-2.5 pr-3 font-semibold">Module</th>
                      <th className="py-2.5 pr-3 text-right font-semibold">Invoiced</th>
                      <th className="py-2.5 pr-3 text-right font-semibold">Collected</th>
                      <th className="py-2.5 text-right font-semibold">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {moduleRows.map((r) => {
                      const Icon = r.icon ?? Stethoscope;
                      return (
                        <tr key={r.key} className="group hover:bg-[var(--color-muted)]/30">
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2.5">
                              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${r.tint}`}>
                                <Icon size={15} aria-hidden="true" />
                              </span>
                              <span className="font-medium text-[var(--color-foreground)]">{r.label}</span>
                              <span className="rounded-full bg-[var(--color-muted)]/60 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-muted-fg)]">{r.count}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-3 text-right font-medium text-[var(--color-foreground)]">{ngn(r.invoiced)}</td>
                          <td className="py-3 pr-3 text-right font-semibold text-emerald-600">{ngn(r.collected)}</td>
                          <td className="py-3 text-right text-[var(--color-muted-fg)]">{ngn(r.outstanding)}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-[var(--color-muted)]/40 font-bold">
                      <td className="px-2 py-3 text-[var(--color-foreground)]">All Modules</td>
                      <td className="px-2 py-3 text-right text-[var(--color-foreground)]">{ngn(summary.income.totals.invoiced)}</td>
                      <td className="px-2 py-3 text-right text-emerald-600">{ngn(summary.income.totals.collected)}</td>
                      <td className="px-2 py-3 text-right text-[var(--color-muted-fg)]">{ngn(summary.income.totals.outstanding)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]">
              <h2 className="mb-1 text-base font-semibold text-[var(--color-foreground)]">Income split</h2>
              <p className="mb-2 text-xs text-[var(--color-muted-fg)]">Collected share by module</p>
              <div className="h-64">
                {incomePie.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-fg)]">No income recorded yet.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={incomePie} cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={3} dataKey="value" nameKey="name">
                        {incomePie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-card-bg)" }} formatter={(v) => [ngn(Number(v)), ""]} labelStyle={{ color: "var(--color-foreground)" }} />
                      <Legend verticalAlign="bottom" iconType="circle" iconSize={8} formatter={(value: string) => <span className="text-xs text-[var(--color-muted-fg)]">{value}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Collected vs invoiced + expenses */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]">
              <h2 className="mb-1 text-base font-semibold text-[var(--color-foreground)]">Collected vs Invoiced</h2>
              <p className="mb-2 text-xs text-[var(--color-muted-fg)]">How much was billed vs actually received, by module</p>
              <div className="h-64">
                {collectedVsInvoiced.every((d) => d.collected === 0 && d.invoiced === 0) ? (
                  <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-fg)]">No data for this period.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={collectedVsInvoiced} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-fg)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-fg)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₦${(v / 1e6).toFixed(1)}M`} />
                      <Tooltip cursor={{ fill: "var(--color-muted)/20" }} contentStyle={{ borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-card-bg)" }} formatter={(v) => [ngn(Number(v)), ""]} labelStyle={{ color: "var(--color-foreground)" }} />
                      <Legend iconType="circle" iconSize={8} formatter={(value: string) => <span className="text-xs text-[var(--color-muted-fg)]">{value}</span>} />
                      <Bar dataKey="collected" name="Collected" fill="#10b981" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="invoiced" name="Invoiced" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]">
              <h2 className="mb-1 text-base font-semibold text-[var(--color-foreground)]">Expenses Breakdown</h2>
              <p className="mb-2 text-xs text-[var(--color-muted-fg)]">Payroll, stock purchases and general operating expenses</p>
              <div className="space-y-3">
                {[
                  { label: "General expenses", value: summary.expenses.general.total, tint: "bg-rose-500" },
                  { label: "Payroll (net paid)", value: summary.expenses.payroll.total, tint: "bg-amber-500" },
                  { label: "Stock purchases (supplier payments)", value: summary.expenses.stock.total, tint: "bg-sky-500" },
                ].map((e) => {
                  const pct = summary.expenses.total > 0 ? (e.value / summary.expenses.total) * 100 : 0;
                  return (
                    <div key={e.label}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-[var(--color-foreground)]">{e.label}</span>
                        <span className="font-semibold text-[var(--color-foreground)]">{ngn(e.value)}</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--color-muted)]/50">
                        <div className={`h-full rounded-full ${e.tint} transition-all duration-500`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                {summary.expenses.payroll.byDepartment.length > 0 && (
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
                      Payroll by department · {summary.expenses.payroll.count} payslips
                    </div>
                    <div className="space-y-1.5">
                      {summary.expenses.payroll.byDepartment.map((d) => {
                        const pct = summary.expenses.payroll.total > 0 ? (d.net / summary.expenses.payroll.total) * 100 : 0;
                        return (
                          <div key={d.department} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate text-[var(--color-foreground)]">{d.department}</span>
                            <span className="flex items-center gap-2">
                              <span className="hidden w-24 rounded-full bg-[var(--color-muted)]/60 sm:block">
                                <span className="block h-1.5 rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                              </span>
                              <span className="font-semibold text-[var(--color-foreground)]">{ngn(d.net)}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
                  <span className="text-sm font-semibold text-[var(--color-foreground)]">Total Expenses</span>
                  <span className="text-lg font-bold text-rose-600">{ngn(summary.expenses.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Expense categories detail */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-[var(--color-foreground)]">Profit &amp; Loss Statement</h2>
                <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
                  From {fmtPeriodDate(summary.range.from)} to {fmtPeriodDate(summary.range.to)} · collected basis
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From date" className={inputCls + " max-w-[9.5rem] text-xs"} />
                <span className="text-xs text-[var(--color-muted-fg)]">to</span>
                <input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="To date" className={inputCls + " max-w-[9.5rem] text-xs"} />
              </div>
            </div>
            <div className="p-5">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <tbody className="divide-y divide-[var(--color-border)]">
                    <tr className="bg-[var(--color-muted)]/40">
                      <td className="px-2 py-2.5 font-bold text-[var(--color-foreground)]">Total Income (Collected)</td>
                      <td className="px-2 py-2.5 text-right font-bold text-emerald-600">{ngn(summary.pnl.incomeCollected)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-xs italic text-[var(--color-muted-fg)]">Less: Expenses</td>
                      <td className="py-2" />
                    </tr>
                    {summary.expenses.general.byCategory.map((c) => (
                      <tr key={c.category}>
                        <td className="py-2 pl-6 text-[var(--color-foreground)]">{c.category}</td>
                        <td className="py-2 text-right text-[var(--color-foreground)]">{ngn(c.amount)}</td>
                      </tr>
                    ))}
                    {summary.expenses.payroll.byDepartment.length > 0 && (
                      <>
                        <tr>
                          <td className="py-2 pl-6 font-medium text-[var(--color-foreground)]">Payroll (net paid)</td>
                          <td className="py-2 text-right font-medium text-[var(--color-foreground)]">{ngn(summary.expenses.payroll.total)}</td>
                        </tr>
                        {summary.expenses.payroll.byDepartment.map((d) => (
                          <tr key={d.department} className="opacity-80">
                            <td className="py-1 pl-12 text-xs text-[var(--color-muted-fg)]">{d.department} <span className="text-[10px]">({d.count} payslips)</span></td>
                            <td className="py-1 pr-0 text-right text-xs text-[var(--color-muted-fg)]">{ngn(d.net)}</td>
                          </tr>
                        ))}
                      </>
                    )}
                    <tr>
                      <td className="py-1 pl-6 text-[var(--color-foreground)]">Stock purchases (supplier payments)</td>
                      <td className="py-1 text-right text-[var(--color-foreground)]">{ngn(summary.expenses.stock.total)}</td>
                    </tr>
                    <tr className="bg-[var(--color-muted)]/40">
                      <td className="px-2 py-2.5 font-bold text-[var(--color-foreground)]">Total Expenses</td>
                      <td className="px-2 py-2.5 text-right font-bold text-[var(--color-foreground)]">{ngn(summary.expenses.total)}</td>
                    </tr>
                    <tr>
                      <td className={`py-3 text-sm font-bold ${summary.pnl.netCollected >= 0 ? "text-emerald-600" : "text-[var(--color-destructive)]"}`}>
                        NET PROFIT/(LOSS) FOR THE PERIOD
                      </td>
                      <td className={`py-3 text-right font-bold ${summary.pnl.netCollected >= 0 ? "text-emerald-600" : "text-[var(--color-destructive)]"}`}>
                        {ngn(summary.pnl.netCollected)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Select a period to view the report.</div>
      )}
    </div>
  );
}
