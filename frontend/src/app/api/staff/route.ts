import { withStaff, okPaginated, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/staff?q=&department=&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const q = resolveParam(req.nextUrl.searchParams.get("q"))?.trim();
  const department = resolveParam(req.nextUrl.searchParams.get("department"));

  let query = ctx.svc
    .from("staff")
    .select(
      "id, staff_number, department, specialization, license_number, years_of_exp, qualification, employment_type, base_salary, is_available, available_from, available_until, on_leave_until, user_id, users(id, email, full_name, role, phone, avatar_url, is_active)",
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (q) query = query.or(`staff_number.ilike.%${q}%,specialization.ilike.%${q}%`);
  if (department) query = query.ilike("department", `%${department}%`);

  const { data, count } = await query;
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

// PUT /api/staff/[id] lives in [id]/route.ts; creation goes through /api/admin/users.

export const runtime = "nodejs";
