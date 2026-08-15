import { withStaff, ok, ValidationError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LEAVE_TYPES = ["annual", "sick", "emergency", "study", "unpaid", "maternity", "paternity"];

// GET /api/hr/leave-balances?year=YYYY&staff_id=me — staff see their own, HR admins see all (or self via staff_id=me).
// POST /api/hr/leave-balances — adjust entitlement (HR admin).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const isHr = isHrAdmin(ctx.role);
  await ctx.svc.rpc("hr_sync_leave_balances", { p_tenant: tenantId });

  const year = Number(req.nextUrl.searchParams.get("year") ?? new Date().getFullYear());
  const staffIdParam = req.nextUrl.searchParams.get("staff_id");
  let query = ctx.svc
    .from("leave_balances")
    .select("id, staff_id, leave_year, leave_type, entitled_days, used_days, staff:staff(department, users(full_name, role))")
    .eq("tenant_id", tenantId)
    .eq("leave_year", year);
  if (!isHr || staffIdParam === "me") {
    const { data: me } = await ctx.svc.from("staff").select("id").eq("user_id", ctx.user.id).eq("tenant_id", tenantId).maybeSingle();
    if (!me) return ok([]);
    query = query.eq("staff_id", me.id);
  }
  const { data, error } = await query.order("staff_id").order("leave_type");
  if (error) throw new ValidationError(error.message);
  return ok(data ?? []);
});

export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");
  const body = await req.json().catch(() => null);
  const staffId = String(body?.staff_id ?? "").trim();
  const leaveType = String(body?.leave_type ?? "").trim();
  if (!staffId || !LEAVE_TYPES.includes(leaveType)) throw new ValidationError("staff_id and a valid leave_type are required");
  const year = Number(body?.leave_year ?? new Date().getFullYear());
  const entitled = Number(body?.entitled_days ?? 0);
  if (!Number.isFinite(entitled) || entitled < 0) throw new ValidationError("entitled_days must be a positive number");

  const { data, error } = await ctx.svc
    .from("leave_balances")
    .upsert({
      tenant_id: tenantId,
      branch_id: ctx.branchId ?? null,
      staff_id: staffId,
      leave_year: year,
      leave_type: leaveType,
      entitled_days: entitled,
    }, { onConflict: "staff_id,leave_year,leave_type" })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "leave_balances",
    entityId: data.id,
    changes: { staff_id: staffId, leave_type: leaveType, entitled_days: entitled },
    description: `Set ${leaveType} entitlement`,
  });
  return ok(data);
});
