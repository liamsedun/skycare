import {
  withStaff,
  ok,
  ValidationError,
  ForbiddenError,
  NotFoundError,
  requireTenant,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["hospital_admin"];

function idFrom(req: NextRequest): string {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  return segs[segs.length - 1];
}

// PUT /api/staff/leave/[id] — admin approves/rejects
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = idFrom(req);
  const body = (await req.json()) as { status?: string };

  const { data: existing, error: getErr } = await ctx.svc
    .from("staff_leave")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (getErr || !existing) throw new NotFoundError("Leave request not found");

  if (!ADMIN_ROLES.includes(ctx.role)) throw new ForbiddenError("Only hospital admins can approve or reject leave");

  if (!body.status || !["approved", "rejected"].includes(body.status)) {
    throw new ValidationError("Status must be approved or rejected");
  }
  if (existing.status !== "pending") throw new ValidationError("Only pending requests can be reviewed");

  const { data, error } = await ctx.svc
    .from("staff_leave")
    .update({ status: body.status, approved_by: ctx.user.id })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await notifyUsers(ctx.svc, {
    orgId: tenantId,
    userIds: [existing.user_id],
    type: "general",
    title: `Leave ${body.status}`,
    message: `Your ${existing.leave_type} leave (${existing.start_date} → ${existing.end_date}) was ${body.status}.`,
    referenceType: "staff_leave",
    referenceId: id,
  });

  await logAudit(req, ctx, {
    action: "update",
    entityType: "staff_leave",
    entityId: id,
    description: `${body.status === "approved" ? "Approved" : "Rejected"} leave request for ${existing.start_date} → ${existing.end_date}`,
  });

  return ok(data);
});

// DELETE /api/staff/leave/[id] — owner deletes own pending request
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = idFrom(req);

  const { data: existing, error: getErr } = await ctx.svc
    .from("staff_leave")
    .select("id, user_id, status")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (getErr || !existing) throw new NotFoundError("Leave request not found");
  if (existing.user_id !== ctx.user.id && !ADMIN_ROLES.includes(ctx.role)) {
    throw new ForbiddenError("You can only delete your own requests");
  }

  const { error } = await ctx.svc.from("staff_leave").delete().eq("id", id);
  if (error) throw new ValidationError(error.message);
  return ok({ ok: true });
});

export const runtime = "nodejs";