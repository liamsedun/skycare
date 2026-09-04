// Shared hospital-wide financial aggregation.
//
// One function that consolidates every income and expense stream in the tenant
// into a single P&L picture, used by BOTH the Financial Report page and the
// Overview dashboard so the two never disagree.
//
//   INCOME (per module, shown as collected vs invoiced vs outstanding):
//     medical   — central `invoices` NOT tagged ward/lab (service invoicing)
//     ward      — central `invoices` with admission_id (migration 0057 tag)
//     lab       — central `invoices` linked via lab_requests.invoice_id (0065)
//                 + walk-in payments (lab_requests.payment_id, 0067)
//     pharmacy  — pharmacy_invoices (invoiced) + pharmacy_payments (collected)
//     other     — other_income records
//   EXPENSES:
//     general   — expenses table, grouped by category
//     payroll   — payroll_records with status = 'paid' (net handled, see below)
//     stock     — supplier_payments (cash actually paid to suppliers for stock)
//
// Collected vs invoiced semantics:
//   - Central modules: invoiced = non-cancelled invoice totals issued in the
//     range; collected = paid_amount applied to those same invoices;
//     outstanding = invoiced − collected (never negative).
//   - Pharmacy: collected = completed pharmacy_payments received in the range
//     (actual cash) so it reflects money-in; invoiced = pharmacy_invoices
//     created in the range; outstanding = invoiced − collected.
//   - Other income is a direct receipt: collected == invoiced.
//   - Payroll uses net_salary of PAID records (the cash actually paid out);
//     employer/statutory contributions are surfaced separately for context.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ModuleIncome {
  invoiced: number;
  collected: number;
  outstanding: number;
  count: number;
}

export interface FinancialOverview {
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
    marginCollected: number; // netCollected / incomeCollected (%)
    marginInvoiced: number;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function bucket(total: number, collected: number, count: number): ModuleIncome {
  const invoiced = round2(Math.max(total, 0));
  const c = round2(Math.min(collected, Math.max(total, 0)));
  return { invoiced, collected: c, outstanding: round2(invoiced - c), count };
}

export async function computeFinancialOverview(
  svc: SupabaseClient,
  tenantId: string,
  range: { from: string; to: string },
  branchId?: string | null
): Promise<FinancialOverview> {
  const { from, to } = range;

  // Build queries then conditionally apply branch filter
  const invQ = svc.from("invoices").select("id, admission_id, total_amount, paid_amount, status").eq("tenant_id", tenantId).gte("issue_date", from).lte("issue_date", to);
  const labReqQ = svc.from("lab_requests").select("invoice_id, payment_id").eq("tenant_id", tenantId).not("invoice_id", "is", null).or("payment_id.not.is.null");
  const pharmInvQ = svc.from("pharmacy_invoices").select("id, patient_id, total_amount, status, synced_invoice_id").eq("tenant_id", tenantId).gte("created_at", `${from}T00:00:00`).lte("created_at", `${to}T23:59:59.999`);
  const pharmPayQ = svc.from("pharmacy_payments").select("amount, invoice_id").eq("tenant_id", tenantId).eq("status", "completed").gte("received_at", `${from}T00:00:00`).lte("received_at", `${to}T23:59:59.999`);
  const otherQ = svc.from("other_income").select("amount").eq("tenant_id", tenantId).gte("income_date", from).lte("income_date", to);
  const expQ = svc.from("expenses").select("amount, category").eq("tenant_id", tenantId).gte("expense_date", from).lte("expense_date", to);
  const payrollQ = svc.from("payroll_records").select("net_salary, base_salary, allowances, bonus, overtime_pay, paye, pension_employer, nhis_employer, pay_date, staff:staff(department)").eq("tenant_id", tenantId).eq("status", "paid");
  const supplierQ = svc.from("supplier_payments").select("amount").eq("tenant_id", tenantId).gte("paid_at", from).lte("paid_at", to);

  const [
    { data: invoices },
    { data: labReqs },
    { data: pharmInvRows },
    { data: pharmPayRows },
    { data: otherRows },
    { data: expRows },
    { data: payrollRows },
    { data: supplierRows },
  ] = await Promise.all([
    branchId ? invQ.eq("branch_id", branchId) : invQ,
    branchId ? labReqQ.eq("branch_id", branchId) : labReqQ,
    branchId ? pharmInvQ.eq("branch_id", branchId) : pharmInvQ,
    branchId ? pharmPayQ.eq("branch_id", branchId) : pharmPayQ,
    branchId ? otherQ.eq("branch_id", branchId) : otherQ,
    branchId ? expQ.eq("branch_id", branchId) : expQ,
    branchId ? payrollQ.eq("branch_id", branchId) : payrollQ,
    branchId ? supplierQ.eq("branch_id", branchId) : supplierQ,
  ]);

  const activeInv = (invoices ?? []).filter((i: Record<string, unknown>) => !["cancelled", "refunded"].includes(i.status as string));
  const labInvoiceIds = new Set((labReqs ?? []).map((r: Record<string, unknown>) => r.invoice_id).filter(Boolean));
  const walkinPaymentIds = (labReqs ?? []).map((r: Record<string, unknown>) => r.payment_id).filter(Boolean);

  let medTotal = 0, medCollected = 0, medCount = 0;
  let wardTotal = 0, wardCollected = 0, wardCount = 0;
  let labTotal = 0, labCollected = 0, labCount = 0;
  for (const i of activeInv ?? []) {
    const total = Number(i.total_amount ?? 0);
    const paid = Number(i.paid_amount ?? 0);
    if (i.admission_id) {
      wardTotal += total; wardCollected += paid; wardCount++;
    } else if (labInvoiceIds.has(i.id)) {
      labTotal += total; labCollected += paid; labCount++;
    } else {
      medTotal += total; medCollected += paid; medCount++;
    }
  }

  // walk-in lab payments
  let walkinLab = 0;
  if (walkinPaymentIds.length > 0) {
    const wpBase = svc.from("payments").select("amount").eq("tenant_id", tenantId).eq("status", "completed").in("id", walkinPaymentIds.slice(0, 500)).gte("paid_at", `${from}T00:00:00`).lte("paid_at", `${to}T23:59:59.999`);
    let wpResult: { data: Array<Record<string, unknown>> | null };
    if (branchId) {
      wpResult = await wpBase.eq("branch_id", branchId);
    } else {
      wpResult = await wpBase;
    }
    walkinLab = (wpResult.data ?? []).reduce((s: number, p: Record<string, unknown>) => s + Number(p.amount), 0);
  }
  labTotal += walkinLab;
  labCollected += walkinLab;
  if (walkinLab > 0) labCount += 1;

  // Pharmacy — exclude synced to avoid double-count
  const pharmInvs = (pharmInvRows ?? []).filter((i: Record<string, unknown>) => !["cancelled", "refunded"].includes(i.status as string));
  const syncedIds = new Set(
    pharmInvs
      .filter((i: Record<string, unknown>) => i.synced_invoice_id && i.patient_id)
      .map((i: Record<string, unknown>) => i.id as string)
  );
  const pharmUnsynced = pharmInvs.filter((i: Record<string, unknown>) => !syncedIds.has(i.id as string));
  const pharmTotal = pharmUnsynced.reduce((s: number, i: Record<string, unknown>) => s + Number(i.total_amount ?? 0), 0);
  const pharmCount = pharmUnsynced.length;

  const pharmCollected = (pharmPayRows ?? [])
    .filter((p: Record<string, unknown>) => !syncedIds.has(p.invoice_id as string))
    .reduce((s: number, p: Record<string, unknown>) => s + Number(p.amount), 0);

  const otherTotal = (otherRows ?? []).reduce((s: number, r: Record<string, unknown>) => s + Number(r.amount), 0);
  const otherCount = (otherRows ?? []).length;

  // Expenses: general
  const byCat = new Map<string, number>();
  for (const e of (expRows ?? []) as Record<string, unknown>[]) {
    const c = String(e.category ?? "Uncategorised");
    byCat.set(c, (byCat.get(c) ?? 0) + Number(e.amount));
  }
  const generalTotal = (expRows ?? []).reduce((s: number, e: Record<string, unknown>) => s + Number(e.amount), 0);

  // Payroll
  const inRangePaid = (payrollRows ?? []).filter(
    (p: Record<string, unknown>) => p.pay_date && String(p.pay_date).slice(0, 10) >= from && String(p.pay_date).slice(0, 10) <= to
  );
  const payrollNet = inRangePaid.reduce((s: number, p: Record<string, unknown>) => s + Number(p.net_salary ?? 0), 0);
  const payrollGross = inRangePaid.reduce(
    (s: number, p: Record<string, unknown>) => s + Number(p.base_salary ?? 0) + Number(p.allowances ?? 0) + Number(p.bonus ?? 0) + Number(p.overtime_pay ?? 0),
    0
  );
  const payrollStatutory = inRangePaid.reduce(
    (s: number, p: Record<string, unknown>) => s + Number(p.paye ?? 0) + Number(p.pension_employer ?? 0) + Number(p.nhis_employer ?? 0),
    0
  );
  const deptMap = new Map<string, { gross: number; net: number; count: number }>();
  for (const p of inRangePaid) {
    const deptStaff = p.staff as unknown as { department?: string } | null;
    const dept = String(deptStaff?.department ?? "Unassigned");
    const cur = deptMap.get(dept) ?? { gross: 0, net: 0, count: 0 };
    cur.gross += Number(p.base_salary ?? 0) + Number(p.allowances ?? 0) + Number(p.bonus ?? 0) + Number(p.overtime_pay ?? 0);
    cur.net += Number(p.net_salary ?? 0);
    cur.count += 1;
    deptMap.set(dept, cur);
  }
  const payrollByDepartment = [...deptMap.entries()]
    .map(([department, v]) => ({ department, gross: round2(v.gross), net: round2(v.net), count: v.count }))
    .sort((a, b) => b.net - a.net);

  // Stock purchases
  const stockTotal = (supplierRows ?? []).reduce((s: number, p: Record<string, unknown>) => s + Number(p.amount), 0);

  // ---- assemble ----
  const medical = bucket(medTotal, medCollected, medCount);
  const ward = bucket(wardTotal, wardCollected, wardCount);
  const lab = bucket(labTotal, labCollected, labCount);
  const pharmacy = { invoiced: round2(pharmTotal), collected: round2(pharmCollected), outstanding: round2(Math.max(pharmTotal - pharmCollected, 0)), count: pharmCount };
  const other = bucket(otherTotal, otherTotal, otherCount);

  const totals: ModuleIncome = {
    invoiced: round2(medical.invoiced + ward.invoiced + lab.invoiced + pharmacy.invoiced + other.invoiced),
    collected: round2(medical.collected + ward.collected + lab.collected + pharmacy.collected + other.collected),
    outstanding: round2(medical.outstanding + ward.outstanding + lab.outstanding + pharmacy.outstanding + other.outstanding),
    count: medCount + wardCount + labCount + pharmCount + otherCount,
  };

  const general = { total: round2(generalTotal), count: (expRows ?? []).length, byCategory: Array.from(byCat.entries()).map(([category, amount]) => ({ category, amount: round2(amount) })).sort((a, b) => b.amount - a.amount) };
  const payroll = { total: round2(payrollNet), gross: round2(payrollGross), net: round2(payrollNet), statutory: round2(payrollStatutory), count: inRangePaid.length, byDepartment: payrollByDepartment };
  const stock = { total: round2(stockTotal), count: (supplierRows ?? []).length };
  const expensesTotal = round2(generalTotal + payroll.total + stock.total);

  const incomeCollected = totals.collected;
  const incomeInvoiced = totals.invoiced;
  const netCollected = round2(incomeCollected - expensesTotal);
  const netInvoiced = round2(incomeInvoiced - expensesTotal);

  return {
    range: { from, to },
    income: { medical, ward, lab, pharmacy, other, totals },
    expenses: { general, payroll, stock, total: expensesTotal },
    pnl: {
      incomeCollected,
      incomeInvoiced,
      expensesTotal,
      netCollected,
      netInvoiced,
      marginCollected: incomeCollected > 0 ? round2((netCollected / incomeCollected) * 100) : 0,
      marginInvoiced: incomeInvoiced > 0 ? round2((netInvoiced / incomeInvoiced) * 100) : 0,
    },
  };
}
