import { withStaff, ok, okPaginated, ValidationError, ForbiddenError, requireTenant, getPagination } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin, hrHasPermission } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/hr/payroll?period=YYYY-MM — payroll records (HR admin/accountant with
// hr.payroll.view, or the staff member's own rows).
// POST /api/hr/payroll — run payroll for a period (HR admin, hr.payroll.run).
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
    .select("id, staff_id, pay_period, base_salary, allowances, deductions, overtime_pay, bonus, net_salary, worked_days, absent_days, overtime_hours, status, generated_at, staff:staff(staff_number, users(full_name, role, email))", { count: "exact" })
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

  const { data, error } = await ctx.svc.rpc("hr_run_payroll", {
    p_tenant: tenantId,
    p_period: period,
    p_branch: ctx.branchId ?? null,
  });
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "payroll_records",
    entityId: null,
    changes: { period, generated: data?.generated },
    description: `Ran payroll for ${period}`,
  });
  return ok(data);
});
