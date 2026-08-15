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
    .select("id, staff_number, department, specialization, employment_type, base_salary, is_available, on_leave_until, created_at, users(full_name, role, email, phone, is_active), profiles:staff_profiles(id, hire_date, salary_grade, bank_name, bank_account_name, bank_account_number, credentials_status)", { count: "exact" })
    .eq("tenant_id", tenantId);
  let staffIdFilter: string[] | null = null;
  if (q) {
    const like = `%${sanitizeLike(q)}%`;
    const [direct, userHits] = await Promise.all([
      ctx.svc.from("staff").select("id").eq("tenant_id", tenantId).or(`staff_number.ilike.${like},department.ilike.${like},specialization.ilike.${like}`),
      ctx.svc.from("users").select("id").eq("tenant_id", tenantId).or(`full_name.ilike.${like},email.ilike.${like}`),
    ]);
    if (direct.error || userHits.error) throw new ValidationError(direct.error?.message ?? userHits.error?.message ?? "Search failed");
    const userIds = (userHits.data ?? []).map((u) => u.id);
    const viaUsers = userIds.length ? ((await ctx.svc.from("staff").select("id").eq("tenant_id", tenantId).in("user_id", userIds)).data ?? []) : [];
    staffIdFilter = [...new Set([...(direct.data ?? []).map((s) => s.id), ...viaUsers.map((s) => s.id)])];
  }
  let roleUserIds: string[] | null = null;
  if (role) {
    const { data: roleUsers, error: roleErr } = await ctx.svc
      .from("users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("role", role)
      .limit(500);
    if (roleErr) throw new ValidationError(roleErr.message);
    roleUserIds = (roleUsers ?? []).map((u) => u.id);
  }
  if (staffIdFilter) {
    if (staffIdFilter.length === 0) return okPaginated([], 0, page, pageSize);
    query = query.in("id", staffIdFilter);
  }
  if (department) query = query.eq("department", department);
  if (roleUserIds) {
    if (roleUserIds.length === 0) return okPaginated([], 0, page, pageSize);
    query = query.in("user_id", roleUserIds);
  }
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

  const { data: staff } = await ctx.svc.from("staff").select("id, branch_id").eq("id", staffId).eq("tenant_id", tenantId).maybeSingle();
  if (!staff) throw new ValidationError("Staff member not found in this hospital");

  const { data: existing } = await ctx.svc.from("staff_profiles").select("id").eq("staff_id", staffId).eq("tenant_id", tenantId).maybeSingle();
  const wasCreated = !existing;

  const money = (v: unknown) => Number(String(v ?? "").replace(/[₦,]/g, "").trim() || NaN);
  const pct = (v: unknown) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 100) throw new ValidationError(`Percentage ${v} is invalid (0-100)`);
    return n;
  };
  const bool = (v: unknown) => {
    const s = String(v ?? "").trim().toLowerCase();
    if (s === "true" || s === "yes" || s === "on" || s === "1") return true;
    if (s === "false" || s === "no" || s === "off" || s === "0" || s === "") return false;
    throw new ValidationError(`Boolean ${v} is invalid (true/false)`);
  };
  const txt = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
  const parseDate = (v: unknown) => {
    const s = txt(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const mo = Number(m[1]), da = Number(m[2]), yr = Number(m[3]);
      if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
        return `${yr}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
      }
    }
    throw new ValidationError(`Date ${s} is invalid (use YYYY-MM-DD)`);
  };

  const patch: Record<string, unknown> = {};
  if (body?.hire_date !== undefined && txt(body.hire_date) !== "") patch.hire_date = parseDate(body.hire_date);
  if (body?.salary_grade !== undefined && txt(body.salary_grade) !== "") patch.salary_grade = txt(body.salary_grade);
  if (body?.bank_account_name !== undefined && txt(body.bank_account_name) !== "") patch.bank_account_name = txt(body.bank_account_name);
  if (body?.bank_name !== undefined && txt(body.bank_name) !== "") patch.bank_name = txt(body.bank_name);
  if (body?.bank_account_number !== undefined && txt(body.bank_account_number) !== "") patch.bank_account_number = txt(body.bank_account_number);
  for (const key of ["pensionable_portion_pct", "pension_rate_pct", "basic_salary_pct", "housing_pct", "transport_pct", "utilities_pct", "meals_pct", "others_pct"] as const) {
    if (body?.[key] !== undefined && txt(body[key]) !== "") patch[key] = pct(body[key]);
  }
  for (const key of ["annual_rent", "annual_mortgage_interest", "annual_life_assurance"] as const) {
    if (body?.[key] !== undefined && txt(body[key]) !== "") {
      const n = money(body[key]);
      if (!Number.isFinite(n) || n < 0) throw new ValidationError(`Amount ${body[key]} is invalid (must be 0+)`);
      patch[key] = n;
    }
  }
  if (body?.nhis_applicable !== undefined && txt(body.nhis_applicable) !== "") patch.nhis_applicable = bool(body.nhis_applicable);
  if (body?.nhf_applicable !== undefined && txt(body.nhf_applicable) !== "") patch.nhf_applicable = bool(body.nhf_applicable);
  if (body?.internal_deductions !== undefined && txt(body.internal_deductions) !== "") {
    const rawStr = txt(body.internal_deductions);
    if (/^\d+(\.\d+)?$/.test(rawStr)) {
      patch.internal_deductions = [];
    } else {
      const raw = Array.isArray(body.internal_deductions) ? body.internal_deductions : String(body.internal_deductions).split(";").map((s) => s.trim()).filter(Boolean);
    patch.internal_deductions = raw.map((d: unknown) => {
      if (typeof d === "object" && d !== null) {
        const dd = d as { description?: unknown; amount?: unknown };
        return { description: txt(dd.description), amount: Math.max(0, money(dd.amount)) };
      }
      const [desc, amt] = String(d).split(":").map((s) => s.trim());
      return { description: desc ?? "", amount: Math.max(0, money(amt ?? "0")) };
    }).filter((d: { description: string; amount: number }) => d.description !== "");
    }
  }
  for (const key of ["pension_pin", "nhf_number", "tax_id"] as const) {
    if (body?.[key] !== undefined && txt(body[key]) !== "") patch[key] = txt(body[key]);
  }

  const { data, error } = await ctx.svc
    .from("staff_profiles")
    .upsert(
      [
        {
          tenant_id: tenantId,
          branch_id: ctx.branchId ?? null,
          staff_id: staffId,
          created_by: ctx.user.id,
          ...patch,
        },
      ],
      { onConflict: "staff_id", ignoreDuplicates: false }
    )
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  const staffPatch: Record<string, unknown> = {};
  if (body?.employment_type !== undefined && txt(body.employment_type) !== "") staffPatch.employment_type = txt(body.employment_type);
  if (body?.base_salary !== undefined && txt(body.base_salary) !== "") {
    const bs = money(body.base_salary);
    if (!Number.isFinite(bs) || bs < 0) throw new ValidationError(`Base salary ${body.base_salary} is invalid (must be 0+)`);
    staffPatch.base_salary = bs;
  }
  if (Object.keys(staffPatch).length > 0) {
    const { error: staffErr } = await ctx.svc.from("staff").update(staffPatch).eq("id", staffId).eq("tenant_id", tenantId);
    if (staffErr) throw new ValidationError(staffErr.message);
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "staff_profiles",
    entityId: data.id,
    changes: { staff_id: staffId, ...patch, ...staffPatch },
    description: `Imported HR profile for ${staffId}`,
  });
  return ok({ ...data, created: wasCreated }, 201);
});
