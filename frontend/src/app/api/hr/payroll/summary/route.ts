import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { isHrAdmin, hrHasPermission } from "@/lib/hr-perms";
import { ForbiddenError } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/hr/payroll/summary?year=YYYY — SkyBooks-style 12-month payroll grid
// (gross / PAYE / pension / NHF / NHIS / net, approved + paid runs only) plus
// annual aggregates for PAYE-return reporting.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isHrAdmin(ctx.role) && !(await hrHasPermission(ctx.svc, tenantId, ctx.role, "hr.payroll.view"))) {
    throw new ForbiddenError("HR payroll access required");
  }
  const year = Number(req.nextUrl.searchParams.get("year") ?? new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new ValidationError("year must be a valid 4-digit year");

  const { data, error } = await ctx.svc
    .from("payroll_records")
    .select("pay_date, generated_at, base_salary, allowances, bonus, overtime_pay, paye, pension_ee, pension_employer, nhf, nhis, nhis_employer, net_salary")
    .eq("tenant_id", tenantId)
    .in("status", ["approved", "paid"]);
  if (error) throw new ValidationError(error.message);

  const monthly = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    monthName: new Date(year, i, 1).toLocaleString("en-US", { month: "long" }),
    gross: 0,
    paye: 0,
    pension: 0,
    pension_employer: 0,
    nhf: 0,
    nhis: 0,
    net: 0,
    count: 0,
  }));

  let annual = { gross: 0, paye: 0, pension: 0, pension_employer: 0, nhf: 0, nhis: 0, net: 0, count: 0 };

  for (const r of data ?? []) {
    const d = r.pay_date ? new Date(`${r.pay_date}T00:00:00`) : new Date(r.generated_at);
    if (d.getFullYear() !== year) continue;
    const m = monthly[d.getMonth()];
    const gross = Number(r.base_salary) + Number(r.allowances) + Number(r.bonus) + Number(r.overtime_pay);
    m.gross += gross;
    m.paye += Number(r.paye) || 0;
    m.pension += Number(r.pension_ee) || 0;
    m.pension_employer += Number(r.pension_employer) || 0;
    m.nhf += Number(r.nhf) || 0;
    m.nhis += Number(r.nhis) || 0;
    m.net += Number(r.net_salary) || 0;
    m.count += 1;
    annual.gross += gross;
    annual.paye += Number(r.paye) || 0;
    annual.pension += Number(r.pension_ee) || 0;
    annual.pension_employer += Number(r.pension_employer) || 0;
    annual.nhf += Number(r.nhf) || 0;
    annual.nhis += Number(r.nhis) || 0;
    annual.net += Number(r.net_salary) || 0;
    annual.count += 1;
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  for (const m of monthly) {
    m.gross = r2(m.gross); m.paye = r2(m.paye); m.pension = r2(m.pension);
    m.pension_employer = r2(m.pension_employer); m.nhf = r2(m.nhf); m.nhis = r2(m.nhis); m.net = r2(m.net);
  }
  for (const k of Object.keys(annual)) annual = { ...annual, [k]: r2(annual[k as keyof typeof annual]) };

  return ok({ year, monthlyTotals: monthly, annualTotals: annual });
});