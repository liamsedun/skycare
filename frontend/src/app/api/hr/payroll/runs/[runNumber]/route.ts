import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { isHrAdmin, hrHasPermission } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RUN_LINE_SELECT =
  "id, staff_id, pay_period, run_number, pay_date, base_salary, allowances, deductions, overtime_pay, bonus, net_salary, worked_days, absent_days, overtime_hours, status, generated_at, approved_by, notes, paye, pension_ee, pension_employer, nhf, nhis, nhis_employer, other_deductions, internal_deductions_total, tax_relief, annual_gross, chargeable_income, effective_rate_pct, calc, staff:staff(staff_number, department, specialization, users(full_name, role, email), profiles:staff_profiles(bank_name, bank_account_number, pension_pin, nhf_number, tax_id))";

// GET /api/hr/payroll/runs/[runNumber] — lines of one payroll run (HR admin sees
// all; other staff see only their own lines; unknown/hidden run → 404).
export const GET = withStaff(async (req: NextRequest, ctx) => {
  const tenantId = requireTenant(ctx);
  const runNumber = decodeURIComponent(req.nextUrl.pathname.split("/").pop()!);

  let query = ctx.svc
    .from("payroll_records")
    .select(RUN_LINE_SELECT)
    .eq("tenant_id", tenantId)
    .eq("run_number", runNumber);

  if (!isHrAdmin(ctx.role) && !(await hrHasPermission(ctx.svc, tenantId, ctx.role, "hr.payroll.view"))) {
    const { data: me } = await ctx.svc
      .from("staff")
      .select("id")
      .eq("user_id", ctx.user.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!me) throw new NotFoundError("Payroll run not found");
    query = query.eq("staff_id", me.id);
  }

  const { data, error } = await query.order("net_salary", { ascending: false });
  if (error) throw new ValidationError(error.message);
  if (!data || data.length === 0) throw new NotFoundError("Payroll run not found");

  const hasDraft = data.some((r) => r.status === "draft");
  const allPaid = data.every((r) => r.status === "paid");
  const status = allPaid ? "paid" : hasDraft ? "draft" : "approved";

  return ok({
    run: {
      runNumber,
      period: data[0].pay_period,
      payDate: data.find((r) => r.pay_date)?.pay_date ?? null,
      status,
      staffCount: data.length,
    },
    lines: data,
  });
});