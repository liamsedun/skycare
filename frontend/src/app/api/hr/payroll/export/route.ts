import { withStaff, ValidationError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin, hrHasPermission } from "@/lib/hr-perms";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CSV_HEADER = "Staff Number,Name,Role,Period,Base Salary,Allowances,Overtime,Bonus,Deductions,Net Salary,Worked Days,Absent Days,Overtime Hours,Status\n";

const esc = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// GET /api/hr/payroll/export?period=YYYY-MM — payroll CSV for accounting (HR admin/accountant).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const period = req.nextUrl.searchParams.get("period")?.trim() || new Date().toISOString().slice(0, 7);
  if (!isHrAdmin(ctx.role) && !(await hrHasPermission(ctx.svc, tenantId, ctx.role, "hr.payroll.view"))) {
    throw new ForbiddenError("You have no payroll export access");
  }

  const { data, error } = await ctx.svc
    .from("payroll_records")
    .select("id, pay_period, base_salary, allowances, deductions, overtime_pay, bonus, net_salary, worked_days, absent_days, overtime_hours, status, staff:staff(staff_number, users(full_name, role))")
    .eq("tenant_id", tenantId)
    .eq("pay_period", period);
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, { action: "export", entityType: "payroll_records", entityId: null, description: `Exported payroll CSV for ${period}` });

  const rows = (data ?? []).map((r) => {
    const s = r.staff as unknown as { staff_number?: string; users?: { full_name?: string; role?: string } } | null;
    return [
      s?.staff_number ?? "", s?.users?.full_name ?? "", s?.users?.role ?? "",
      r.pay_period, r.base_salary, r.allowances, r.overtime_pay, r.bonus, r.deductions,
      r.net_salary, r.worked_days, r.absent_days, r.overtime_hours, r.status,
    ].map(esc).join(",");
  });
  const csv = CSV_HEADER + rows.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payroll-${period}.csv"`,
    },
  });
});
