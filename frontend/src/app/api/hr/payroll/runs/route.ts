import { withStaff, ok, ValidationError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { isHrAdmin, hrHasPermission } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const r2 = (n: number) => Math.round(n * 100) / 100;

// GET /api/hr/payroll/runs — payroll runs grouped by run number with aggregate
// totals (drives the PAYE / Pension schedule and Payslips run pickers).
// HR admin (or a role granted hr.payroll.view) only.
export const GET = withStaff(async (req: NextRequest, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isHrAdmin(ctx.role) && !(await hrHasPermission(ctx.svc, tenantId, ctx.role, "hr.payroll.view"))) {
    throw new ForbiddenError("You have no payroll access");
  }

  const { data, error } = await ctx.svc
    .from("payroll_records")
    .select("run_number, pay_period, pay_date, status, base_salary, net_salary, paye, pension_ee, pension_employer, nhf, nhis")
    .eq("tenant_id", tenantId)
    .order("pay_period", { ascending: false })
    .order("run_number", { ascending: true })
    .limit(5000);
  if (error) throw new ValidationError(error.message);

  const groups = new Map<string, NonNullable<typeof data>>();
  for (const r of data ?? []) {
    const key = r.run_number ?? `LEGACY-${r.pay_period}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const runs = [...groups.entries()].map(([key, rows]) => {
    const hasDraft = rows.some((r) => r.status === "draft");
    const allPaid = rows.every((r) => r.status === "paid");
    const status = allPaid ? "paid" : hasDraft ? "draft" : "approved";
    const sum = (f: (r: (typeof rows)[0]) => number) => r2(rows.reduce((s, r) => s + f(r), 0));
    return {
      runNumber: rows[0]?.run_number ?? key,
      period: rows[0]?.pay_period ?? key,
      payDate: rows.find((r) => r.pay_date)?.pay_date ?? null,
      status,
      staffCount: rows.length,
      gross: sum((r) => Number(r.base_salary) || 0),
      paye: sum((r) => Number(r.paye) || 0),
      pensionEE: sum((r) => Number(r.pension_ee) || 0),
      pensionER: sum((r) => Number(r.pension_employer) || 0),
      nhf: sum((r) => Number(r.nhf) || 0),
      nhis: sum((r) => Number(r.nhis) || 0),
      net: sum((r) => Number(r.net_salary) || 0),
    };
  });

  return ok(runs);
});