import {
  withStaff,
  ok,
  okPaginated,
  ValidationError,
  requireTenant,
  getPagination,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const LEAVE_TYPES = ["annual", "sick", "study", "unpaid", "maternity", "emergency", "paternity"];
const ADMIN_ROLES = ["hospital_admin", "super_admin"];

function isAdmin(ctx: any): boolean {
  return ADMIN_ROLES.includes(ctx.role);
}

// GET /api/staff/leave?status=&page=&pageSize= — staff: own requests; admins: all
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const status = req.nextUrl.searchParams.get("status");

  let query = ctx.svc
    .from("staff_leave")
    .select(
      "id, tenant_id, user_id, leave_type, start_date, end_date, days, reason, status, approved_by, created_at, users!staff_leave_user_id_fkey(id, full_name, email, role), approver:users!staff_leave_approved_by_fkey(id, full_name)",
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (isAdmin(ctx)) {
    if (status) query = query.eq("status", status);
  } else {
    query = query.eq("user_id", ctx.user.id);
  }

  const { data, count, error } = await query;
  if (error) throw new ValidationError(error.message);
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

interface CreateLeaveBody {
  leaveType: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

// POST /api/staff/leave — request leave
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as CreateLeaveBody;

  if (!body.leaveType || !LEAVE_TYPES.includes(body.leaveType)) {
    throw new ValidationError("Invalid leave type");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.startDate ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate ?? "")) {
    throw new ValidationError("Start and end dates are required (YYYY-MM-DD)");
  }
  if (body.endDate < body.startDate) throw new ValidationError("End date cannot be before start date");

  const { data, error } = await ctx.svc
    .from("staff_leave")
    .insert({
      tenant_id: tenantId,
      user_id: ctx.user.id,
      leave_type: body.leaveType,
      start_date: body.startDate,
      end_date: body.endDate,
      reason: body.reason?.trim() || null,
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "staff_leave",
    entityId: data.id,
    description: `Requested ${body.leaveType} leave ${body.startDate} → ${body.endDate}`,
  });

  return ok(data, 201);
});

export const runtime = "nodejs";