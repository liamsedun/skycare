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
import { fmtDate, fmtTime } from "@/lib/shift-format";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["hospital_admin", "super_admin"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function idFrom(req: NextRequest): string {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  return segs[segs.length - 1];
}

// PUT /api/duty-roster/[id] — update a shift (date, times, note). When body.notify
// is true the assigned staff member gets an in-app + push "updated" notification.
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!ADMIN_ROLES.includes(ctx.role)) throw new ForbiddenError("Only hospital admins can manage the roster");
  const id = idFrom(req);
  const body = await req.json();

  const { data: existing, error: getErr } = await ctx.svc
    .from("duty_roster")
    .select("id, staff_id, user_id, shift_date, from_time, until_time")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (getErr || !existing) throw new NotFoundError("Shift not found");

  const patch: Record<string, any> = {};
  if (body.shiftDate !== undefined) {
    if (!DATE_RE.test(body.shiftDate)) throw new ValidationError("shiftDate must be YYYY-MM-DD");
    patch.shift_date = body.shiftDate;
  }
  if (body.fromTime !== undefined) {
    if (!/^\d{2}:\d{2}$/.test(body.fromTime)) throw new ValidationError("fromTime must be HH:MM");
    patch.from_time = body.fromTime;
  }
  if (body.untilTime !== undefined) {
    if (!/^\d{2}:\d{2}$/.test(body.untilTime)) throw new ValidationError("untilTime must be HH:MM");
    patch.until_time = body.untilTime;
  }
  if (body.note !== undefined) patch.note = body.note?.trim() || null;
  if (body.userId !== undefined) patch.user_id = body.userId || null;

  const { data, error } = await ctx.svc.from("duty_roster").update(patch).eq("id", id).select().single();
  if (error) throw new ValidationError(error.message);

  if (body.notify && existing.user_id) {
    const shiftDate = patch.shift_date ?? existing.shift_date ?? "";
    const fromTime = patch.from_time ?? existing.from_time ?? "";
    const untilTime = patch.until_time ?? existing.until_time ?? "";
    await notifyUsers(ctx.svc, {
      orgId: tenantId,
      userIds: [existing.user_id],
      type: "duty_schedule",
      title: "Duty schedule updated",
      message: `DATE: ${fmtDate(shiftDate)}, TIME: FROM ${fmtTime(fromTime)} UNTIL ${fmtTime(untilTime)}`,
      referenceType: "duty_roster",
      referenceId: id,
    });
  }

  await logAudit(req, ctx, {
    action: "update",
    entityType: "duty_roster",
    entityId: id,
    description: "Updated duty roster shift",
  });

  return ok(data);
});

// DELETE /api/duty-roster/[id] — remove a shift
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!ADMIN_ROLES.includes(ctx.role)) throw new ForbiddenError("Only hospital admins can manage the roster");
  const id = idFrom(req);

  const { data: existing, error: getErr } = await ctx.svc
    .from("duty_roster")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (getErr || !existing) throw new NotFoundError("Shift not found");

  const { error } = await ctx.svc.from("duty_roster").delete().eq("id", id);
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "duty_roster",
    entityId: id,
    description: "Removed duty roster shift",
  });

  return ok({ ok: true });
});

export const runtime = "nodejs";