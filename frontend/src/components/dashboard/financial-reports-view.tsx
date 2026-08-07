"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  DollarSign,
  Download,
  Loader2,
  Printer,
  ReceiptText,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  LineChart,
  Line,
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
import { formatDate, ngn } from "@/lib/auth";

const inputCls =
  "focus-ring h-10 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-foreground)] outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";

interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  status: string;
  total_amount: number;
  paid_amount: number;
}

interface ExpenseRecord {
  id: string;
  description: string;
  category: string;
  amount: number;
  expense_date: string;
}

interface IncomeRecord {
  id: string;
  description: string;
  category: string;
  amount: number;
  income_date: string;
}

interface PatientRowLite {
  id: string;
  created_at: string;
}

interface OrgInfo {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  logo_url: string | null;
}

const EXPENSE_LINES = [
  "Medical Expenses",
  "Other Medical Expenses",
  "Staff Salary",
  "Electricity (PHCN)",
  "Motor Vehicle Maintenance (Fuel & Repairs)",
  "Generator (Fuel & Repairs)",
  "Stationeries & Printing",
  "Janitorial/Cleaning",
  "Internet",
  "Telephone",
  "Rents & Rates",
  "Bank Charges",
  "Travelling/Transportation",
  "Newspapers/Medical Journals",
  "Staff Welfare & Training",
  "Other Misc. Expenses",
] as const;

function expenseLineFor(e: ExpenseRecord): string {
  const desc = (e.description || "").toLowerCase();
  const cat = e.category || "";
  if (/(generator|diesel|petrol)/.test(desc)) return "Generator (Fuel & Repairs)";
  if (/(internet|wifi|data)/.test(desc)) return "Internet";
  if (/(telephone|airtime)/.test(desc)) return "Telecommunications";
  if (/(stationer|printing|printer|paper|ink)/.test(desc)) return "Stationeries & Printing";
  if (/(janitor|cleaning|cleaner|sanitiz|sanitise|housekeeping)/.test(desc)) return "Janitorial/Cleaning";
  if (/(bank charge|banking|pos fee|pos charge|card fee|transaction fee)/.test(desc)) return "Bank Charges";
  if (/(newspaper|journal|magazine)/.test(desc)) return "Newspapers/Medical Journals";
  if (/(vehicle|car repair|fuel for car|motor repair)/.test(desc)) return "Motor Vehicle Maintenance (Fuel & Repairs)";
  if (/(travel|transport|fare|travelling)/.test(desc)) return "Travelling/Transportation";
  switch (cat) {
    case "medical_supplies": return "Medical Expenses";
    case "equipment": return "Other Medical Expenses";
    case "salaries": return "Staff Salary";
    case "utilities": return "Electricity (PHCN)";
    case "rent": return "Rents & Rates";
    case "maintenance": return "Motor Vehicle Maintenance (Fuel & Repairs)";
    case "transport": return "Travelling/Transportation";
    case "staff_welfare":
    case "training": return "Staff Welfare & Training";
    default: return "Other Misc. Expenses";
  }
}

const CHART_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#6366f1", "#ec4899", "#14b8a6"];

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
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [pnlFrom, setPnlFrom] = useState("");
  const [pnlTo, setPnlTo] = useState("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [otherIncomeData, setOtherIncomeData] = useState<IncomeRecord[]>([]);
  const [expensesData, setExpensesData] = useState<ExpenseRecord[]>([]);
  const [patients, setPatients] = useState<PatientRowLite[]>([]);
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  }, [month]);

  const loadFinancials = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invRes, incRes, patRes, orgRes] = await Promise.all([
        fetch("/api/invoices?pageSize=100", { cache: "no-store" }),
        fetch("/api/other-income?page_size=500", { cache: "no-store" }),
        fetch("/api/patients?pageSize=100", { cache: "no-store" }),
        fetch("/api/tenant-settings", { cache: "no-store" }),
      ]);
      const [invBody, incBody, patBody, orgBody] = await Promise.all([
        invRes.json(),
        incRes.json(),
        patRes.json(),
        orgRes.json(),
      ]);
      if (invRes.ok) setInvoices((invBody.data ?? []) as Invoice[]);
      if (incRes.ok) setOtherIncomeData((incBody.data ?? []) as IncomeRecord[]);
      if (patRes.ok) setPatients((patBody.data ?? []) as PatientRowLite[]);
      if (orgRes.ok) setOrgInfo((orgBody.data ?? null) as OrgInfo | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load financial data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Every calendar month the user selects, reset the P&L window to that month.
  useEffect(() => {
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    setPnlFrom(`${y}-${String(m).padStart(2, "0")}-01`);
    setPnlTo(`${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`);
  }, [month]);

  useEffect(() => {
    loadFinancials();
  }, [loadFinancials]);

  // Expenses for the P&L window only.
  useEffect(() => {
    if (!pnlFrom || !pnlTo) return;
    setLoadingExpenses(true);
    fetch(`/api/expenses?from=${pnlFrom}&to=${pnlTo}&pageSize=500`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (body.data) setExpensesData(body.data as ExpenseRecord[]);
      })
      .catch(() => setExpensesData([]))
      .finally(() => setLoadingExpenses(false));
  }, [pnlFrom, pnlTo]);

  const kpis = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);
    const prevStart = new Date(y, m - 2, 1);
    const inMonth = (d: Date) => d >= start && d < end;
    const inPrev = (d: Date) => d >= prevStart && d < start;

    const medRev = invoices
      .filter((i) => (i.status === "paid" || i.status === "partially_paid") && inMonth(new Date(i.issue_date)))
      .reduce((sum, i) => sum + i.total_amount, 0);
    const othRev = otherIncomeData
      .filter((r) => inMonth(new Date(r.income_date)))
      .reduce((sum, r) => sum + r.amount, 0);
    const totalRevenue = medRev + othRev;
    const prevMonthRev =
      invoices
        .filter((i) => (i.status === "paid" || i.status === "partially_paid") && inPrev(new Date(i.issue_date)))
        .reduce((sum, i) => sum + i.total_amount, 0) +
      otherIncomeData.filter((r) => inPrev(new Date(r.income_date))).reduce((sum, r) => sum + r.amount, 0);
    const trend = prevMonthRev > 0 ? ((totalRevenue - prevMonthRev) / prevMonthRev) * 100 : 0;
    const newPatients = patients.filter((p) => inMonth(new Date(p.created_at))).length;

    return {
      totalRevenue,
      trendPct: trend,
      revenueUp: totalRevenue >= prevMonthRev,
      newPatients,
      totalPatients: patients.length,
    };
  }, [invoices, otherIncomeData, patients, month]);

  const revenueTrendData = useMemo(() => {
    const now2 = new Date();
    const byMonth: Record<string, number> = {};
    const key = (d: Date) => d.toLocaleString("default", { month: "short", year: "2-digit" });
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now2.getFullYear(), now2.getMonth() - i, 1);
      byMonth[key(d)] = 0;
    }
    invoices.filter((i) => i.status === "paid" || i.status === "partially_paid").forEach((i) => {
      const k = key(new Date(i.issue_date));
      if (byMonth[k] !== undefined) byMonth[k] += i.total_amount;
    });
    otherIncomeData.forEach((r) => {
      const k = key(new Date(r.income_date));
      if (byMonth[k] !== undefined) byMonth[k] += r.amount;
    });
    return Object.entries(byMonth).map(([monthName, amount]) => ({ month: monthName, amount }));
  }, [invoices, otherIncomeData]);

  const incomeSourcePie = useMemo(() => {
    const med = invoices
      .filter((i) => i.status === "paid" || i.status === "partially_paid")
      .reduce((sum, i) => sum + i.total_amount, 0);
    const oth = otherIncomeData.reduce((sum, r) => sum + r.amount, 0);
    const data = [
      { name: "Medical services", value: med },
      { name: "Other income", value: oth },
    ].filter((d) => d.value > 0);
    return data.map((d, i) => ({ ...d, color: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [invoices, otherIncomeData]);

  const pnlData = useMemo(() => {
    if (!pnlFrom || !pnlTo) return null;
    const start = new Date(`${pnlFrom}T00:00:00`);
    const end = new Date(`${pnlTo}T23:59:59`);
    const inPeriod = (d: string) => {
      const dt = new Date(d);
      return dt >= start && dt <= end;
    };
    const medRev = invoices
      .filter((i) => (i.status === "paid" || i.status === "partially_paid") && inPeriod(i.issue_date))
      .reduce((sum, i) => sum + i.total_amount, 0);
    const othRev = otherIncomeData.filter((r) => inPeriod(r.income_date)).reduce((sum, r) => sum + r.amount, 0);
    const totals: Record<string, number> = {};
    EXPENSE_LINES.forEach((l) => { totals[l] = 0; });
    expensesData.forEach((e) => {
      const line = expenseLineFor(e);
      totals[line] = (totals[line] || 0) + Number(e.amount || 0);
    });
    const totalExpenses = Object.values(totals).reduce((s, v) => s + v, 0);
    const totalIncome = medRev + othRev;
    return {
      medRev,
      othRev,
      totalIncome,
      lines: EXPENSE_LINES.map((label) => ({ label, amount: totals[label] || 0 })),
      totalExpenses,
      net: totalIncome - totalExpenses,
    };
  }, [invoices, otherIncomeData, expensesData, pnlFrom, pnlTo]);

  const exportCsv = useCallback(() => {
    if (!pnlData) return;
    const rows: string[][] = [
      [`${orgInfo?.name ?? "SkyCare"} — Financial Report`],
      ["Generated", new Date().toLocaleString()],
      ["Period", monthLabel],
      [""],
      ["Metric", "Value"],
      ["Total Revenue", String(kpis.totalRevenue)],
      ["Revenue vs Last Month", `${kpis.revenueUp ? "+" : ""}${kpis.trendPct.toFixed(1)}%`],
      ["New Patients (Month)", String(kpis.newPatients)],
      ["Total Patients", String(kpis.totalPatients)],
      [""],
      ["Month", "Revenue"],
      ...revenueTrendData.map((d) => [d.month, String(d.amount)]),
      [""],
      ["PROFIT AND LOSS STATEMENT"],
      ["Period", `From ${fmtPeriodDate(pnlFrom)} to ${fmtPeriodDate(pnlTo)}`],
      ["Revenue from Medical Services", String(pnlData.medRev)],
      ["Other Incomes", String(pnlData.othRev)],
      ["Total Income", String(pnlData.totalIncome)],
      [""],
      ["Less: Expenses"],
      ...pnlData.lines.map((l) => [l.label, String(l.amount)]),
      ["Total Expenses", String(pnlData.totalExpenses)],
      ["NET PROFIT/(LOSS) FOR THE PERIOD", String(pnlData.net)],
    ];
    downloadCsv(`financial-report-${new Date().toISOString().split("T")[0]}.csv`, rows);
  }, [orgInfo, monthLabel, kpis, revenueTrendData, pnlData, pnlFrom, pnlTo]);

  const printPnl = useCallback(() => {
    if (!pnlData) return;
    const contact = [orgInfo?.phone && `Tel: ${orgInfo.phone}`, orgInfo?.email && `Email: ${orgInfo.email}`]
      .filter(Boolean).join(" • ");
    const rows: Array<[string, number, string?]> = [
      ["Revenue from Medical Services", pnlData.medRev],
      ["Other Incomes", pnlData.othRev],
      ["Total Income", pnlData.totalIncome, "bold"],
      ["Less: Expenses", 0, "italic"],
      ...pnlData.lines.map((l) => [l.label, l.amount] as [string, number]),
      ["Total Expenses", pnlData.totalExpenses, "bold"],
      ["NET PROFIT/(LOSS) FOR THE PERIOD", pnlData.net, "net"],
    ];
    const rowHtml = rows.map((r: any) => {
      const cls = r[2] === "bold" ? ' class="b"' : r[2] === "italic" ? ' class="i"' : r[2] === "net" ? ' class="net"' : "";
      return `<tr${cls}><td>${r[0]}</td><td class="amt">${ngn(r[1])}</td></tr>`;
    }).join("");
    const w = window.open("", "_blank", "width=820,height=960");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Profit &amp; Loss Statement</title>
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
  table { width: 100%; border-collapse: collapse; border: 1px solid #ccc; font-size: 13px; }
  tr { border-bottom: 1px solid #eee; }
  tr.b { background: #f5f5f5; font-weight: 700; }
  tr.b td { border-top: 1px solid #bbb; }
  tr.i td { font-style: italic; color: #666; }
  tr.net { background: #efefef; font-weight: 800; }
  tr.net td { border-top: 2px solid #999; border-bottom: 2px solid #999; }
  td { padding: 9px 14px; }
  td.amt { text-align: right; }
  @media print { body { padding: 20px; } }
</style></head><body>
  <div class="header">
    ${orgInfo?.logo_url ? `<img class="logo" src="${orgInfo.logo_url}" alt="logo" />` : `<div class="logo-fallback">${(orgInfo?.name || "S")[0]}</div>`}
    <div>
      <h1>${orgInfo?.name || "Hospital"}</h1>
      ${orgInfo?.address ? `<p class="sub">${orgInfo.address}</p>` : ""}
      ${contact ? `<p class="contact">${contact}</p>` : ""}
    </div>
  </div>
  <div class="title">
    <p>PROFIT AND LOSS STATEMENT</p>
    <p>For the period from ${fmtPeriodDate(pnlFrom)} to ${fmtPeriodDate(pnlTo)}</p>
  </div>
  <table>${rowHtml}</table>
  <script>window.onload = function(){ window.print(); };</script>
</body></html>`);
    w.document.close();
  }, [pnlData, orgInfo, pnlFrom, pnlTo]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
            Financial Report
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
            Revenue, expenses and profit &amp; loss for your hospital.
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
            <Printer size={15} aria-hidden="true" /> Print P&L
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
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Total Revenue (Month)",
                value: ngn(kpis.totalRevenue),
                trend: `${kpis.revenueUp ? "+" : ""}${kpis.trendPct.toFixed(1)}% vs last month`,
                up: kpis.revenueUp,
                icon: DollarSign,
                color: "text-emerald-600",
                bg: "bg-emerald-50",
              },
              {
                label: "Other Income (Month)",
                value: ngn(otherIncomeData.filter((r) => {
                  const [y, m] = month.split("-").map(Number);
                  const d = new Date(r.income_date);
                  return d.getMonth() + 1 === m && d.getFullYear() === y;
                }).reduce((s, r) => s + r.amount, 0)),
                trend: "donations, sales, grants",
                up: true,
                icon: TrendingUp,
                color: "text-sky-600",
                bg: "bg-sky-50",
              },
              {
                label: "New Patients (Month)",
                value: String(kpis.newPatients),
                trend: `${kpis.totalPatients} on record`,
                up: true,
                icon: ReceiptText,
                color: "text-blue-600",
                bg: "bg-blue-50",
              },
              {
                label: "Net for Period",
                value: pnlData ? ngn(pnlData.net) : "—",
                trend: "per selected P&L window",
                up: (pnlData?.net ?? 0) >= 0,
                icon: Wallet,
                color: "text-purple-600",
                bg: "bg-purple-50",
              },
            ].map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div key={kpi.label} className="rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--color-muted-fg)]">{kpi.label}</p>
                      <p className="mt-1 truncate text-xl font-bold text-[var(--color-foreground)]">{kpi.value}</p>
                      <p className={`mt-1 text-xs font-medium ${kpi.up ? "text-emerald-600" : "text-[var(--color-destructive)]"}`}>{kpi.trend}</p>
                    </div>
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${kpi.bg}`}>
                      <Icon size={20} aria-hidden="true" className={kpi.color} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]">
              <h2 className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">Revenue trend (12 months)</h2>
              <div className="h-72">
                {revenueTrendData.every((d) => d.amount === 0) ? (
                  <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-fg)]">
                    No revenue data yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={revenueTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted-fg)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-fg)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₦${(v / 1e6).toFixed(1)}M`} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-card-bg)" }}
                        formatter={(v) => [ngn(Number(v)), "Revenue"]} labelStyle={{ color: "var(--color-foreground)" }} />
                      <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={2} dot={{ fill: "#2563eb", r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]">
              <h2 className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">Income by source</h2>
              <div className="h-72">
                {incomeSourcePie.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-fg)]">
                    No income recorded yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={incomeSourcePie} cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={3} dataKey="value" nameKey="name">
                        {incomeSourcePie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-card-bg)" }}
                        formatter={(v) => [ngn(Number(v)), ""]} labelStyle={{ color: "var(--color-foreground)" }} />
                      <Legend verticalAlign="bottom" iconType="circle" iconSize={8}
                        formatter={(value: string) => <span className="text-xs text-[var(--color-muted-fg)]">{value}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-[var(--color-foreground)]">Profit &amp; Loss Statement</h2>
                <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
                  From {pnlFrom ? fmtPeriodDate(pnlFrom) : "—"} to {pnlTo ? fmtPeriodDate(pnlTo) : "—"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={pnlFrom}
                  onChange={(e) => e.target.value && setPnlFrom(e.target.value)}
                  aria-label="From date"
                  className={inputCls + " max-w-[9.5rem] text-xs"}
                />
                <span className="text-xs text-[var(--color-muted-fg)]">to</span>
                <input
                  type="date"
                  value={pnlTo}
                  onChange={(e) => e.target.value && setPnlTo(e.target.value)}
                  aria-label="To date"
                  className={inputCls + " max-w-[9.5rem] text-xs"}
                />
              </div>
            </div>
            <div className="p-5">
              {loadingExpenses ? (
                <div className="flex justify-center py-10"><Loader2 size={20} aria-hidden="true" className="animate-spin text-[var(--color-muted-fg)]" /></div>
              ) : pnlData ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <tbody className="divide-y divide-[var(--color-border)]">
                      <tr>
                        <td className="py-2.5 text-[var(--color-foreground)]">Revenue from Medical Services</td>
                        <td className="py-2.5 text-right font-medium text-[var(--color-foreground)]">{ngn(pnlData.medRev)}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-[var(--color-foreground)]">Other Incomes</td>
                        <td className="py-2.5 text-right font-medium text-[var(--color-foreground)]">{ngn(pnlData.othRev)}</td>
                      </tr>
                      <tr className="bg-[var(--color-muted)]/40">
                        <td className="px-2 py-2.5 font-bold text-[var(--color-foreground)]">Total Income</td>
                        <td className="px-2 py-2.5 text-right font-bold text-[var(--color-foreground)]">{ngn(pnlData.totalIncome)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 text-xs italic text-[var(--color-muted-fg)]">Less: Expenses</td>
                        <td className="py-2" />
                      </tr>
                      {pnlData.lines.map((l) => (
                        <tr key={l.label}>
                          <td className="py-2 pl-6 text-[var(--color-foreground)]">{l.label}</td>
                          <td className="py-2 text-right text-[var(--color-foreground)]">{ngn(l.amount)}</td>
                        </tr>
                      ))}
                      <tr className="bg-[var(--color-muted)]/40">
                        <td className="px-2 py-2.5 font-bold text-[var(--color-foreground)]">Total Expenses</td>
                        <td className="px-2 py-2.5 text-right font-bold text-[var(--color-foreground)]">{ngn(pnlData.totalExpenses)}</td>
                      </tr>
                      <tr>
                        <td className={`py-3 text-sm font-bold ${pnlData.net >= 0 ? "text-emerald-600" : "text-[var(--color-destructive)]"}`}>
                          NET PROFIT/(LOSS) FOR THE PERIOD
                        </td>
                        <td className={`py-3 text-right font-bold ${pnlData.net >= 0 ? "text-emerald-600" : "text-[var(--color-destructive)]"}`}>
                          {ngn(pnlData.net)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-10 text-center text-sm text-[var(--color-muted-fg)]">
                  Select a period to view the P&amp;L statement.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}