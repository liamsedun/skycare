import { withStaff, ok, okPaginated, ValidationError, ForbiddenError, requireTenant, getPagination } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin, hrHasPermission } from "@/lib/hr-perms";
import { calculateHrPayroll, HrPayrollCalculation } from "@/lib/hr-payroll-calc";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const r2 = (n: number) => Math.round(n * 100) / 100;

const RECORD_SELECT =
  "id, staff_id, pay_period, run_number, pay_date, base_salary, allowances, deductions, overtime_pay, bonus, net_salary, worked_days, absent_days, overtime_hours, status, generated_at, paye, pension_ee, pension_employer, nhf, nhis, nhis_employer, other_deductions, internal_deductions_total, tax_relief, annual_gross, chargeable_income, effective_rate_pct, calc, staff:staff(staff_number, users(full_name, role, email))";

// GET /api/hr/payroll?period=YYYY-MM — payroll records (HR admin/accountant with
// hr.payroll.view, or the staff member's own rows).
// POST /api/hr/payroll — run payroll for a period via the SkyBooks engine
// (HR admin, hr.payroll.run). Body: { period, payDate?, staffIds? }.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const period = req.nextUrl.searchParams.get("period")?.trim() || new Date().toISOString().slice(0, 7);
  const staffId = req.nextUrl.searchParams.get("staff_id")?.trim() || null;
  const { page, from, to, pageSize } = getPagination(req.nextUrl.searchParams);

  const allowed = isHrAdmin(ctx.role) || (await hrHasPermission(ctx.svc, tenantId, ctx.role, "hr.payroll.view"));
  let myStaffId: string | null = null;
  if (!allowed) {
    const { data: me } = await ctx.svc.from("staff").select("id").eq("user_id", ctx.user.id).eq("tenant_id", tenantId).maybeSingle();
    if (!me) throw new ForbiddenError("You have no payroll access");
    myStaffId = me.id;
  }

  let query = ctx.svc
    .from("payroll_records")
    .select(RECORD_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("pay_period", period);
  if (myStaffId) query = query.eq("staff_id", myStaffId);
  if (staffId) query = query.eq("staff_id", staffId);
  const { data, error, count } = await query.order("net_salary", { ascending: false }).range(from, to);
  if (error) throw new ValidationError(error.message);
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isHrAdmin(ctx.role) && !(await hrHasPermission(ctx.svc, tenantId, ctx.role, "hr.payroll.run"))) {
    throw new ForbiddenError("HR admin access required");
  }
  const body = await req.json().catch(() => null);
  const period = String(body?.period ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(period)) throw new ValidationError("period must be YYYY-MM");

  let payDate: string | null = null;
  if (body?.payDate != null && String(body.payDate).trim() !== "") {
    const raw = String(body.payDate).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
      throw new ValidationError("payDate must be YYYY-MM-DD");
    }
    payDate = raw;
  } else {
    const [y, m] = period.split("-").map(Number);
    payDate = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;
  }

  let staffIds: string[] | null = null;
  if (body?.staffIds != null) {
    if (!Array.isArray(body.staffIds)) throw new ValidationError("staffIds must be an array");
    staffIds = (body.staffIds as unknown[]).map(String).filter(Boolean);
    if (staffIds.length === 0) throw new ValidationError("staffIds cannot be empty when provided");
    if (staffIds.length > 200) throw new ValidationError("staffIds limited to 200 staff");
  }

  // Load eligible staff (active only) with payroll config from profiles.
  const { data: activeUsers } = await ctx.svc
    .from("users")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  const activeUserIds = new Set((activeUsers ?? []).map((u) => u.id));

  let staffQuery = ctx.svc
    .from("staff")
    .select(
      "id, base_salary, user_id, users(full_name, role, is_active), profiles:staff_profiles(pensionable_portion_pct, pension_rate_pct, nhis_applicable, nhf_applicable, basic_salary_pct, housing_pct, transport_pct, utilities_pct, meals_pct, others_pct, annual_rent, annual_mortgage_interest, annual_life_assurance, internal_deductions)"
    )
    .eq("tenant_id", tenantId);
  if (staffIds) {
    const { data: tenantStaff } = await ctx.svc
      .from("staff")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("id", staffIds);
    const validIds = (tenantStaff ?? []).map((s) => s.id);
    if (validIds.length === 0) throw new ValidationError("None of the selected staff exist in this hospital");
    staffQuery = staffQuery.in("id", validIds);
  }
  const { data: staffRows, error: staffErr } = await staffQuery;
  if (staffErr) throw new ValidationError(staffErr.message);

  const eligible = (staffRows ?? []).filter((s) => activeUserIds.has(s.user_id));
  if (eligible.length === 0) {
    throw new ValidationError("No active staff to run payroll for");
  }

  // Run number: PR-0001 style, sequential per tenant (distinct run numbers).
  const { data: rnRows } = await ctx.svc
    .from("payroll_records")
    .select("run_number")
    .eq("tenant_id", tenantId)
    .not("run_number", "is", null)
    .limit(5000);
  const existingRuns = new Set<string>((rnRows ?? []).map((r) => r.run_number).filter(Boolean));
  let nextRunSeq = existingRuns.size + 1;
  const nextRunNumber = () => {
    const n = `PR-${String(nextRunSeq).padStart(4, "0")}`;
    nextRunSeq += 1;
    existingRuns.add(n);
    return n;
  };
  let batchRun: string | null = null;
  const batchRunNumber = () => (batchRun ??= nextRunNumber());
  const { data: periodRunRow } = await ctx.svc
    .from("payroll_records")
    .select("run_number")
    .eq("tenant_id", tenantId)
    .eq("pay_period", period)
    .not("run_number", "is", null)
    .limit(1)
    .maybeSingle();
  const periodRunNumber = (periodRunRow?.run_number as string | null) ?? null;

  const results: {
    staff: (typeof staffRows)[0];
    calc: HrPayrollCalculation;
    recordId: string;
    created: boolean;
  }[] = [];

  for (const staff of eligible) {
    const rawP = staff.profiles ?? {};
    const p = (Array.isArray(rawP) ? rawP[0] : rawP) as Record<string, unknown>;
    const calc = calculateHrPayroll(Number(staff.base_salary) || 0, {
      basicSalaryPct: Number(p.basic_salary_pct) || 50,
      housingPct: Number(p.housing_pct) || 20,
      transportPct: Number(p.transport_pct) || 10,
      utilitiesPct: Number(p.utilities_pct) || 10,
      mealsPct: Number(p.meals_pct) || 5,
      othersPct: Number(p.others_pct) || 5,
      pensionablePortionPct: Number(p.pensionable_portion_pct) || 80,
      pensionRatePct: Number(p.pension_rate_pct) || 8,
      nhisApplicable: p.nhis_applicable === true,
      nhfApplicable: p.nhf_applicable !== false,
      annualRent: Number(p.annual_rent) || 0,
      annualMortgageInterest: Number(p.annual_mortgage_interest) || 0,
      annualLifeAssurance: Number(p.annual_life_assurance) || 0,
      internalDeductions: Array.isArray(p.internal_deductions)
        ? (p.internal_deductions as { description: string; amount: number }[])
        : [],
    });

    const record: Record<string, unknown> = {
      tenant_id: tenantId,
      branch_id: ctx.branchId ?? null,
      staff_id: staff.id,
      pay_period: period,
      pay_date: payDate,
      base_salary: calc.grossPay,
      allowances: r2(calc.housing + calc.transport + calc.utilities + calc.meals + calc.otherAllowances),
      deductions: r2(calc.nhis + calc.nhf + calc.internalDeductionsTotal),
      overtime_pay: 0,
      bonus: 0,
      net_salary: calc.netPay,
      worked_days: 0,
      absent_days: 0,
      overtime_hours: 0,
      notes: null,
      paye: calc.monthlyPAYE,
      pension_ee: calc.pensionEE,
      pension_employer: calc.pensionEmployer,
      nhf: calc.nhf,
      nhis: calc.nhis,
      nhis_employer: calc.nhisEmployer,
      other_deductions: r2(calc.nhis + calc.nhf + calc.internalDeductionsTotal),
      internal_deductions_total: calc.internalDeductionsTotal,
      tax_relief: calc.rentRelief,
      annual_gross: calc.annualGross,
      chargeable_income: calc.chargeableIncome,
      effective_rate_pct: calc.effectiveRatePct,
      calc: calc as object,
    };

    const { data: existing, error: existingErr } = await ctx.svc
      .from("payroll_records")
      .select("id, status, run_number")
      .eq("tenant_id", tenantId)
      .eq("staff_id", staff.id)
      .eq("pay_period", period)
      .maybeSingle();
    if (existingErr) throw new ValidationError(existingErr.message);

    let recordId: string;
    let created: boolean;
    let myRun: string;
    if (existing) {
      if (existing.status === "paid") {
        throw new ValidationError(`Payroll for ${staff.id} in ${period} is already paid — cannot re-run`);
      }
      recordId = existing.id;
      created = false;
      myRun = existing.run_number ?? nextRunNumber();
      record.run_number = myRun;
      const { error: updErr } = await ctx.svc.from("payroll_records").update(record).eq("id", existing.id).eq("tenant_id", tenantId);
      if (updErr) throw new ValidationError(updErr.message);
      await ctx.svc.from("payroll_lines").delete().eq("payroll_id", existing.id).eq("tenant_id", tenantId);
    } else {
      myRun = periodRunNumber ?? batchRunNumber();
      record.run_number = myRun;
      const { data: rec, error: insErr } = await ctx.svc
        .from("payroll_records")
        .insert(record)
        .select("id")
        .single();
      if (insErr) throw new ValidationError(insErr.message);
      recordId = rec.id;
      created = true;
    }

    const lines = [
      { line_type: "basic", label: "Basic salary", amount: calc.basicSalary },
      { line_type: "allowance", label: "Housing", amount: calc.housing },
      { line_type: "allowance", label: "Transport", amount: calc.transport },
      { line_type: "allowance", label: "Utilities", amount: calc.utilities },
      { line_type: "allowance", label: "Meals", amount: calc.meals },
      { line_type: "allowance", label: "Other allowances", amount: calc.otherAllowances },
      ...(calc.nhis > 0 ? [{ line_type: "deduction" as const, label: "NHIS (employee)", amount: calc.nhis }] : []),
      ...(calc.nhf > 0 ? [{ line_type: "deduction" as const, label: "NHF (employee)", amount: calc.nhf }] : []),
      ...(calc.pensionEE > 0 ? [{ line_type: "deduction" as const, label: "Pension (employee)", amount: calc.pensionEE }] : []),
      ...(calc.monthlyPAYE > 0 ? [{ line_type: "deduction" as const, label: "PAYE tax", amount: calc.monthlyPAYE }] : []),
      ...calc.internalDeductions.map((d) => ({
        line_type: "deduction" as const,
        label: `Internal: ${d.description}`,
        amount: d.amount,
      })),
    ];
    const { error: linesErr } = await ctx.svc.from("payroll_lines").insert(lines.map((l) => ({ ...l, tenant_id: tenantId, payroll_id: recordId })));
    if (linesErr) throw new ValidationError(linesErr.message);

    results.push({ staff, calc, recordId, created });
    batchRun ??= myRun;
  }

  const summary = {
    period,
    payDate,
    runNumber: batchRun ?? nextRunNumber(),
    generated: results.filter((r) => r.created).length,
    updated: results.filter((r) => !r.created).length,
    staffCount: results.length,
    total_gross: r2(results.reduce((s, r) => s + r.calc.grossPay, 0)),
    total_paye: r2(results.reduce((s, r) => s + r.calc.monthlyPAYE, 0)),
    total_pension: r2(results.reduce((s, r) => s + r.calc.pensionEE, 0)),
    total_nhf: r2(results.reduce((s, r) => s + r.calc.nhf, 0)),
    total_nhis: r2(results.reduce((s, r) => s + r.calc.nhis, 0)),
    total_net: r2(results.reduce((s, r) => s + r.calc.netPay, 0)),
  };

  await logAudit(req, ctx, {
    action: "create",
    entityType: "payroll_records",
    entityId: null,
    changes: summary,
    description: `Ran payroll for ${period} (${batchRun ?? nextRunNumber()})`,
  });
  return ok(summary);
});