import { withStaff, ok, ValidationError, ForbiddenError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/hr/payroll/[id] — payslip with lines (own or HR admin/accountant).
// PUT — adjust allowances/bonus/deductions or approve/pay (HR admin).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;

  const { data, error } = await ctx.svc
    .from("payroll_records")
    .select("id, staff_id, pay_period, base_salary, allowances, deductions, overtime_pay, bonus, net_salary, worked_days, absent_days, overtime_hours, status, generated_at, notes, staff:staff(staff_number, users(full_name, role, email))")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new ValidationError(error.message);
  if (!data) throw new NotFoundError("Payroll record not found");

  if (!isHrAdmin(ctx.role)) {
    const { data: me } = await ctx.svc.from("staff").select("id").eq("user_id", ctx.user.id).eq("tenant_id", tenantId).maybeSingle();
    if (!me || me.id !== data.staff_id) throw new ForbiddenError("You can only view your own payslip");
  }

  const { data: lines } = await ctx.svc.from("payroll_lines").select("id, line_type, label, amount").eq("payroll_id", id).order("created_at");
  return ok({ ...data, lines: lines ?? [] });
});

export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");
  const body = await req.json().catch(() => null);

  const { data: rec, error: recError } = await ctx.svc
    .from("payroll_records")
    .select("base_salary, allowances, deductions, overtime_pay, bonus")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (recError) throw new ValidationError(recError.message);
  if (!rec) throw new NotFoundError("Payroll record not found");

  const allowances = body?.allowances != null ? Number(body.allowances) : rec.allowances;
  const bonus = body?.bonus != null ? Number(body.bonus) : rec.bonus;
  const deductions = body?.deductions != null ? Number(body.deductions) : rec.deductions;
  if ([allowances, bonus, deductions].some((v) => !Number.isFinite(v) || v < 0)) {
    throw new ValidationError("allowances/bonus/deductions must be positive numbers");
  }
  const net = Math.round((rec.base_salary + allowances + rec.overtime_pay + bonus - deductions) * 100) / 100;

  const patch: Record<string, unknown> = { allowances, deductions, bonus, net_salary: net };
  if (body?.status != null) {
    const status = String(body.status).trim();
    if (!["draft", "approved", "paid"].includes(status)) throw new ValidationError("Invalid status");
    patch.status = status;
    if (status === "approved" || status === "paid") patch.approved_by = ctx.user.id;
  }
  if (body?.notes != null) patch.notes = String(body.notes).trim() || null;

  const { data, error } = await ctx.svc
    .from("payroll_records")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, { action: "update", entityType: "payroll_records", entityId: id, changes: patch, description: "Adjusted payroll record" });
  return ok(data);
});
