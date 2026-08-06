import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PENDING_LAB_STATUSES = ["requested", "sample_collected", "in_progress"];

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const round2 = (n: number) => Math.round(n * 100) / 100;

function monthRange(raw: string | null): { from: string; to: string } {
  const m = raw?.match(/^(\d{4})-(\d{2})$/);
  if (raw && !m) throw new ValidationError("month must be YYYY-MM");
  const now = new Date();
  const year = m ? Number(m[1]) : now.getFullYear();
  const month = m ? Number(m[2]) : now.getMonth() + 1;
  if (month < 1 || month > 12) throw new ValidationError("month must be 01-12");
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

// GET /api/dashboard?month=YYYY-MM — everything the /app overview needs at once
// (month-scoped aggregates + time-card charts). Service client so financial
// tables are legible to every staff role, matching the existing /api/expenses GET.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { from, to } = monthRange(req.nextUrl.searchParams.get("month"));

  const year = Number(from.slice(0, 4));
  const selMonth = Number(from.slice(5, 7));

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentLastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentFrom = `${currentMonth}-01`;
  const currentTo = `${currentMonth}-${String(currentLastDay).padStart(2, "0")}`;

  // Trailing-12-months window ending at the selected month (trend chart)
  const windowStart = `${shiftMonth(year, selMonth, -11)}-01`;

  // Last 7 calendar days window (weekly chart)
  const weekStart = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);

  const [
    patientsRes,
    todayApptsRes,
    labRes,
    monthMedRes,
    monthIncomeRes,
    monthExpRes,
    curMedRes,
    curOtherRes,
    trendMedRes,
    trendIncomeRes,
    weekMedRes,
    weekIncomeRes,
    staffRes,
    deptApptsRes,
    recentRes,
    monthPatientsRes,
    monthApptsRes,
    allApptsRes,
    invMonthRes,
  ] = await Promise.all([
    ctx.svc.from("patients").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    ctx.svc
      .from("appointments")
      .select(
        "id, scheduled_date, start_time, status, type, reason, patients(first_name, last_name, patient_number)"
      )
      .eq("tenant_id", tenantId)
      .eq("scheduled_date", today)
      .order("start_time", { ascending: true })
      .limit(10),
    ctx.svc
      .from("lab_orders")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", PENDING_LAB_STATUSES),
    ctx.svc
      .from("payments")
      .select("amount, paid_at")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .gte("paid_at", `${from}T00:00:00`)
      .lte("paid_at", `${to}T23:59:59.999`),
    ctx.svc
      .from("other_income")
      .select("amount, income_date")
      .eq("tenant_id", tenantId)
      .gte("income_date", from)
      .lte("income_date", to),
    ctx.svc
      .from("expenses")
      .select("amount, expense_date")
      .eq("tenant_id", tenantId)
      .gte("expense_date", from)
      .lte("expense_date", to),
    ctx.svc
      .from("payments")
      .select("amount, paid_at")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .gte("paid_at", `${currentFrom}T00:00:00`)
      .lte("paid_at", `${currentTo}T23:59:59.999`),
    ctx.svc
      .from("other_income")
      .select("amount, income_date")
      .eq("tenant_id", tenantId)
      .gte("income_date", currentFrom)
      .lte("income_date", currentTo),
    ctx.svc
      .from("payments")
      .select("amount, paid_at")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .gte("paid_at", `${windowStart}T00:00:00`)
      .lte("paid_at", `${to}T23:59:59.999`),
    ctx.svc
      .from("other_income")
      .select("amount, income_date")
      .eq("tenant_id", tenantId)
      .gte("income_date", windowStart)
      .lte("income_date", to),
    ctx.svc
      .from("payments")
      .select("amount, paid_at")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .gte("paid_at", `${weekStart}T00:00:00`),
    ctx.svc
      .from("other_income")
      .select("amount, income_date")
      .eq("tenant_id", tenantId)
      .gte("income_date", weekStart),
    ctx.svc.from("staff").select("user_id, department").eq("tenant_id", tenantId),
    ctx.svc
      .from("appointments")
      .select("doctor_id")
      .eq("tenant_id", tenantId)
      .gte("scheduled_date", windowStart),
    ctx.svc
      .from("patients")
      .select("id, patient_number, first_name, last_name, gender, date_of_birth, phone, email, city, state, status, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(5),
    ctx.svc
      .from("patients")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59.999`),
    ctx.svc
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("scheduled_date", from)
      .lte("scheduled_date", to),
    ctx.svc
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    ctx.svc
      .from("invoices")
      .select("id, total_amount, paid_amount")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "partially_paid"])
      .gte("issue_date", from)
      .lte("issue_date", to),
  ]);

  if (
    !monthMedRes.data || !monthIncomeRes.data || !monthExpRes.data ||
    !trendMedRes.data || !trendIncomeRes.data || !weekMedRes.data || !weekIncomeRes.data ||
    !curMedRes.data || !curOtherRes.data
  ) {
    throw new ValidationError("Failed to compute dashboard");
  }

  const sumOf = (rows: { amount: number }[]) =>
    rows.reduce((s, r) => s + Number(r.amount), 0);

  // ---- Selected month profit/loss ----
  const medical = round2(sumOf(monthMedRes.data));
  const other = round2(sumOf(monthIncomeRes.data));
  const expenses = round2(sumOf(monthExpRes.data));
  const revenue = round2(medical + other);
  const net = round2(revenue - expenses);
  const margin = revenue > 0 ? round2((net / revenue) * 100) : 0;

  // ---- KPI totals (always the current month / today) ----
  const revenueThisMonth = round2(sumOf(curMedRes.data) + sumOf(curOtherRes.data));

  // ---- Weekly revenue (last 7 days, bucketed by weekday) ----
  const weeklyBuckets: Record<string, { medical: number; other: number }> = {};
  DAY_LABELS.forEach((d) => {
    weeklyBuckets[d] = { medical: 0, other: 0 };
  });
  weekMedRes.data.forEach((p) => {
    const iso = new Date(p.paid_at).toISOString().slice(0, 10);
    const bucket = weeklyBuckets[DAY_LABELS[new Date(`${iso}T00:00:00`).getDay()]];
    if (bucket) bucket.medical += Number(p.amount);
  });
  weekIncomeRes.data.forEach((r) => {
    const bucket = weeklyBuckets[DAY_LABELS[new Date(`${r.income_date}T00:00:00`).getDay()]];
    if (bucket) bucket.other += Number(r.amount);
  });
  const weekly = DAY_LABELS.map((day) => ({
    day,
    medical: round2(weeklyBuckets[day].medical),
    other: round2(weeklyBuckets[day].other),
  }));

  // ---- Monthly trend (12 months ending at the selected month) ----
  const trend: { month: string; medical: number; other: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(year, selMonth - 1 - i, 1);
    trend.push({ month: MONTH_LABELS[d.getMonth()], medical: 0, other: 0 });
  }
  const trendIndex = (d: Date) =>
    (d.getFullYear() - year) * 12 + (d.getMonth() - (selMonth - 1)) + 11;
  trendMedRes.data.forEach((p) => {
    const idx = trendIndex(new Date(p.paid_at));
    if (idx >= 0 && idx < 12) trend[idx].medical += Number(p.amount);
  });
  trendIncomeRes.data.forEach((r) => {
    const idx = trendIndex(new Date(`${r.income_date}T00:00:00`));
    if (idx >= 0 && idx < 12) trend[idx].other += Number(r.amount);
  });
  const monthlyTrend = trend.map((t) => ({
    month: t.month,
    medical: round2(t.medical),
    other: round2(t.other),
  }));

  // ---- Appointments by department (doctor -> staff.department) ----
  const deptByUser = new Map<string, string>();
  (staffRes.data ?? []).forEach((s) => {
    if (s.user_id && s.department) deptByUser.set(s.user_id, s.department);
  });
  const deptCounts = new Map<string, number>();
  for (const a of deptApptsRes.data ?? []) {
    const dept = a.doctor_id ? (deptByUser.get(a.doctor_id) ?? "General") : "Unassigned";
    deptCounts.set(dept, (deptCounts.get(dept) ?? 0) + 1);
  }
  const departments = Array.from(deptCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([department, count]) => ({ department, count }));

  const recentPatients = (recentRes.data ?? []).map((p) => ({
    id: p.id,
    patientNumber: p.patient_number,
    name: `${p.first_name} ${p.last_name}`,
    status: p.status,
    createdAt: p.created_at,
    patient: {
      id: p.id,
      patient_number: p.patient_number,
      first_name: p.first_name,
      last_name: p.last_name,
      gender: p.gender,
      date_of_birth: p.date_of_birth,
      phone: p.phone,
      email: p.email,
      city: p.city,
      state: p.state,
      status: p.status,
    },
  }));

  // ---- Life Blossom-style KPI extras ----
  const monthly = monthlyTrend;
  const prevMonth = monthly[monthly.length - 2];
  const curMonth = monthly[monthly.length - 1];
  const prevRevenue = (prevMonth?.medical ?? 0) + (prevMonth?.other ?? 0);
  const curRevenue = (curMonth?.medical ?? 0) + (curMonth?.other ?? 0);
  const revenueTrendPct =
    prevRevenue > 0 ? round2(((curRevenue - prevRevenue) / prevRevenue) * 100) : 0;
  const revenueUp = curRevenue >= prevRevenue;
  const staffCount = staffRes.data?.length ?? 0;
  const appointmentsInPeriod = monthApptsRes.count ?? 0;
  const appointmentsOutsidePeriod = Math.max((allApptsRes.count ?? 0) - appointmentsInPeriod, 0);
  const newPatients = monthPatientsRes.count ?? 0;
  const unpaidInvoices = invMonthRes.data ?? [];
  const outstanding = round2(
    unpaidInvoices.reduce((s, i) => s + (Number(i.total_amount) - Number(i.paid_amount ?? 0)), 0)
  );
  const unpaidCount = unpaidInvoices.length;

  const todayList = (todayApptsRes.data ?? []).map((a) => ({
    id: a.id,
    scheduledDate: a.scheduled_date,
    startTime: a.start_time,
    status: a.status,
    type: a.type,
    reason: a.reason ?? null,
    patients: a.patients ?? null,
  }));

  return ok({
    kpis: {
      totalPatients: patientsRes.count ?? 0,
      todayAppointments: todayApptsRes.count ?? 0,
      revenueThisMonth,
      pendingLabOrders: labRes.count ?? 0,
      newPatients,
      staffCount,
      appointmentsInPeriod,
      appointmentsOutsidePeriod,
      unpaidCount,
      outstanding,
      revenueTrendPct,
      revenueUp,
    },
    profit: {
      month: from.slice(0, 7),
      revenue,
      medical,
      other,
      expenses,
      net,
      margin,
    },
    weekly,
    split: { medical, other },
    monthlyTrend,
    departments,
    recentPatients,
    todayAppointments: todayList,
  });
});

/** YYYY-MM for the month `offset` months from origin (year y, month m 1-based). */
function shiftMonth(y: number, m: number, offset: number): string {
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const runtime = "nodejs";
