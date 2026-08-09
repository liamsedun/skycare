import { withStaff, ok, ValidationError, ForbiddenError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/hr/staff/[id] — HR profile + payroll history + credentials + leave balances (staff own or HR admin).
// PUT — update HR profile (HR admin). DELETE — remove HR profile (HR admin).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;

  const { data: staff, error } = await ctx.svc
    .from("staff")
    .select("id, staff_number, department, specialization, employment_type, base_salary, is_available, on_leave_until, users(id, full_name, role, email, phone), profiles:staff_profiles(*)")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new ValidationError(error.message);
  if (!staff) throw new NotFoundError("Staff member not found");
  if (ctx.role !== "hospital_admin" && ctx.role !== "hr_officer" && ctx.role !== "super_admin"
      && (staff.users as { id?: string } | null)?.id !== ctx.user.id) {
    throw new ForbiddenError("You can only view your own HR profile");
  }

  const [payroll, credentials, balances] = await Promise.all([
    ctx.svc.from("payroll_records").select("id, pay_period, base_salary, allowances, deductions, overtime_pay, bonus, net_salary, worked_days, absent_days, overtime_hours, status").eq("staff_id", id).eq("tenant_id", tenantId).order("pay_period", { ascending: false }).limit(12),
    ctx.svc.from("staff_credentials").select("id, license_number, certification, issuing_body, expiry_date, verified, verified_at").eq("staff_id", id).eq("tenant_id", tenantId).order("expiry_date"),
    ctx.svc.from("leave_balances").select("leave_year, leave_type, entitled_days, used_days").eq("staff_id", id).eq("tenant_id", tenantId).order("leave_year", { ascending: false }),
  ]);

  return ok({
    ...staff,
    payroll: payroll.data ?? [],
    credentials: credentials.data ?? [],
    leave_balances: balances.data ?? [],
  });
});

export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");
  const body = await req.json().catch(() => null);

  const { data, error } = await ctx.svc
    .from("staff_profiles")
    .update({
      hire_date: body?.hire_date ?? null,
      salary_grade: String(body?.salary_grade ?? "").trim() || null,
      bank_account_name: String(body?.bank_account_name ?? "").trim() || null,
      bank_name: String(body?.bank_name ?? "").trim() || null,
      bank_account_number: String(body?.bank_account_number ?? "").trim() || null,
    })
    .eq("staff_id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();
  if (error) throw new ValidationError(error.message);
  if (!data) throw new NotFoundError("HR profile not found");

  await logAudit(req, ctx, { action: "update", entityType: "staff_profiles", entityId: data.id, description: "Updated HR profile" });
  return ok(data);
});

export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");

  const { data, error } = await ctx.svc
    .from("staff_profiles")
    .delete()
    .eq("staff_id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();
  if (error) throw new ValidationError(error.message);
  if (!data) throw new NotFoundError("HR profile not found");

  await logAudit(req, ctx, { action: "delete", entityType: "staff_profiles", entityId: data.id, description: "Deleted HR profile" });
  return ok({ deleted: true });
});
