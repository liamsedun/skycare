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
    ctx.svc.from("leave_balances").select("id, staff_id, leave_year, leave_type, entitled_days, used_days").eq("staff_id", id).eq("tenant_id", tenantId).order("leave_year", { ascending: false }),
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

  const { data: staff, error: staffErr } = await ctx.svc
    .from("staff")
    .select("id, branch_id, tenant_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (staffErr) throw new ValidationError(staffErr.message);
  if (!staff) throw new NotFoundError("Staff member not found");

  const profilePatch: Record<string, unknown> = {};
  if (body?.hire_date !== undefined) profilePatch.hire_date = body?.hire_date ?? null;
  if (body?.salary_grade !== undefined) profilePatch.salary_grade = String(body?.salary_grade ?? "").trim() || null;
  if (body?.bank_account_name !== undefined) profilePatch.bank_account_name = String(body?.bank_account_name ?? "").trim() || null;
  if (body?.bank_name !== undefined) profilePatch.bank_name = String(body?.bank_name ?? "").trim() || null;
  if (body?.bank_account_number !== undefined) profilePatch.bank_account_number = String(body?.bank_account_number ?? "").trim() || null;

  const intPct = (v: unknown, fallback: number) => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 100) throw new ValidationError(`Percentage ${v} is invalid (0-100)`);
    return n;
  };
  const nairaField = (v: unknown) => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new ValidationError(`Amount ${v} is invalid (must be 0+)`);
    return n;
  };

  const pctFields: [string, number][] = [
    ["pensionable_portion_pct", 80],
    ["pension_rate_pct", 8],
    ["basic_salary_pct", 50],
    ["housing_pct", 20],
    ["transport_pct", 10],
    ["utilities_pct", 10],
    ["meals_pct", 5],
    ["others_pct", 5],
  ];
  for (const [key, fallback] of pctFields) {
    if (body?.[key] !== undefined) profilePatch[key] = intPct(body[key], fallback);
  }
  const nairaFields = ["annual_rent", "annual_mortgage_interest", "annual_life_assurance"];
  for (const key of nairaFields) {
    if (body?.[key] !== undefined) profilePatch[key] = nairaField(body[key]) ?? 0;
  }
  if (body?.nhis_applicable !== undefined) profilePatch.nhis_applicable = body.nhis_applicable === true;
  if (body?.nhf_applicable !== undefined) profilePatch.nhf_applicable = body.nhf_applicable === true;
  if (body?.internal_deductions !== undefined) {
    if (!Array.isArray(body.internal_deductions)) throw new ValidationError("internalDeductions must be an array");
    profilePatch.internal_deductions = body.internal_deductions
      .filter((d: unknown) => d && typeof (d as { description?: unknown }).description === "string")
      .map((d: { description: string; amount: unknown }) => ({
        description: String(d.description).trim(),
        amount: Math.max(0, Number(d.amount) || 0),
      }));
  }
  for (const key of ["pension_pin", "nhf_number", "tax_id"]) {
    if (body?.[key] !== undefined) profilePatch[key] = String(body[key] ?? "").trim() || null;
  }

  const { data, error } = await ctx.svc
    .from("staff_profiles")
    .upsert(
      [
        {
          staff_id: id,
          tenant_id: tenantId,
          branch_id: staff.branch_id ?? null,
          created_by: ctx.user.id,
          ...profilePatch,
        },
      ],
      { onConflict: "staff_id", ignoreDuplicates: false }
    )
    .select()
    .maybeSingle();
  if (error) throw new ValidationError(error.message);

  if (body?.baseSalary !== undefined && body.baseSalary !== null && body.baseSalary !== "") {
    const salary = Number(body.baseSalary);
    if (!Number.isFinite(salary) || salary < 0) throw new ValidationError("Base salary must be a positive amount");
    const { error: salErr } = await ctx.svc
      .from("staff")
      .update({ base_salary: salary })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (salErr) throw new ValidationError(salErr.message);
  }
  if (body?.employment_type !== undefined && body.employment_type !== null) {
    const et = String(body.employment_type).trim();
    if (!et) throw new ValidationError("Employment type cannot be empty");
    const { error: etErr } = await ctx.svc
      .from("staff")
      .update({ employment_type: et })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (etErr) throw new ValidationError(etErr.message);
  }

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
