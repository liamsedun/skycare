import { withStaff, ok, okPaginated, ValidationError, ForbiddenError, requireTenant, getPagination, sanitizeLike } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/hr/staff — staff directory with HR profiles (any staff role).
// POST /api/hr/staff — create/extend an HR profile for existing staff (HR admin).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  await ctx.svc.rpc("hr_init_profiles", { p_tenant: tenantId });
  const { from, to, pageSize } = getPagination(req.nextUrl.searchParams);
  const page = Math.floor(Number(req.nextUrl.searchParams.get("page") ?? "1"));
  const q = req.nextUrl.searchParams.get("q")?.trim() || null;
  const department = req.nextUrl.searchParams.get("department")?.trim() || null;
  const role = req.nextUrl.searchParams.get("role")?.trim() || null;

  let query = ctx.svc
    .from("staff")
    .select("id, staff_number, department, specialization, employment_type, base_salary, is_available, on_leave_until, created_at, users(full_name, role, email, phone, is_active), profiles:staff_profiles(id, hire_date, salary_grade, bank_name, bank_account_name, credentials_status)", { count: "exact" })
    .eq("tenant_id", tenantId);
  if (q) query = query.or(`staff_number.ilike.%${sanitizeLike(q)}%,users.full_name.ilike.%${sanitizeLike(q)}%,users.email.ilike.%${sanitizeLike(q)}%`);
  if (department) query = query.eq("department", department);
  if (role) query = query.eq("users.role", role);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw new ValidationError(error.message);
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");
  const body = await req.json().catch(() => null);
  const staffId = String(body?.staff_id ?? "").trim();
  if (!staffId) throw new ValidationError("staff_id is required");

  const { data: staff } = await ctx.svc.from("staff").select("id").eq("id", staffId).eq("tenant_id", tenantId).maybeSingle();
  if (!staff) throw new ValidationError("Staff member not found in this hospital");

  const { data, error } = await ctx.svc
    .from("staff_profiles")
    .insert({
      tenant_id: tenantId,
      branch_id: ctx.branchId ?? null,
      staff_id: staffId,
      hire_date: body?.hire_date ?? null,
      salary_grade: String(body?.salary_grade ?? "").trim() || null,
      bank_account_name: String(body?.bank_account_name ?? "").trim() || null,
      bank_name: String(body?.bank_name ?? "").trim() || null,
      bank_account_number: String(body?.bank_account_number ?? "").trim() || null,
      created_by: ctx.user.id,
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "staff_profiles",
    entityId: data.id,
    changes: { staff_id: staffId },
    description: "Created HR profile",
  });
  return ok(data, 201);
});
