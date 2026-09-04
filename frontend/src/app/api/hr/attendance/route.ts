import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/hr/attendance?date=YYYY-MM-DD&month=YYYY-MM&staff_id= — attendance
// log. Staff see their own rows only; HR admins see the whole hospital.
// Runs the auto-absence sync first (past scheduled shifts without check-in).
// attendance joins staff through users (attendance.user_id -> users -> staff),
// so department/role enrichment happens via a staff map after the query.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const isHr = ctx.role === "hospital_admin" || ctx.role === "hr_officer";
  await ctx.svc.rpc("hr_mark_missed_shifts", { p_tenant: tenantId, p_branch: ctx.branchId ?? null });

  const date = req.nextUrl.searchParams.get("date")?.trim() || null;
  const month = req.nextUrl.searchParams.get("month")?.trim() || null;
  const staffId = req.nextUrl.searchParams.get("staff_id")?.trim() || null;

  const { data: staffRows } = await ctx.svc
    .from("staff")
    .select("id, user_id, department")
    .eq("tenant_id", tenantId);
  const byId = new Map((staffRows ?? []).map((st) => [st.id, st]));
  const deptByUser = new Map((staffRows ?? []).map((st) => [st.user_id, st.department]));

  let userFilter: string | null = null;
  if (!isHr) {
    const { data: me } = await ctx.svc.from("staff").select("id, user_id").eq("user_id", ctx.user.id).eq("tenant_id", tenantId).maybeSingle();
    if (!me) return ok([]);
    userFilter = me.user_id;
  } else if (staffId) {
    userFilter = byId.get(staffId)?.user_id ?? null;
    if (!userFilter) return ok([]);
  }

  let query = ctx.svc
    .from("attendance")
    .select("id, user_id, work_date, check_in, check_out, status, notes, users(full_name, role)")
    .eq("tenant_id", tenantId);
  if (userFilter) query = query.eq("user_id", userFilter);
  if (date) query = query.eq("work_date", date);
  if (month) query = query.gte("work_date", `${month}-01`).lte("work_date", `${month}-31`);

  const { data, error } = await query.order("work_date", { ascending: false }).order("check_in", { ascending: false }).limit(500);
  if (error) throw new ValidationError(error.message);

  const rows = (data ?? []).map((row) => ({
    ...row,
    staff: {
      id: byId.get(row.user_id)?.id ?? null,
      department: deptByUser.get(row.user_id) ?? null,
      users: row.users,
    },
  }));
  return ok(rows);
});
