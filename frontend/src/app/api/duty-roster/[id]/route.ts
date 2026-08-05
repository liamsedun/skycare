import {
  withStaff,
  ok,
  ValidationError,
  ForbiddenError,
  NotFoundError,
  requireTenant,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["hospital_admin", "super_admin"];

function idFrom(req: NextRequest): string {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  return segs[segs.length - 1];
}

// PUT /api/duty-roster/[id] — update a shift
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!ADMIN_ROLES.includes(ctx.role)) throw new ForbiddenError("Only hospital admins can manage the roster");
  const id = idFrom(req);
  const body = await req.json();

  const { data: existing, error: getErr } = await ctx.svc
    .from("duty_roster")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (getErr || !existing) throw new NotFoundError("Shift not found");

  const patch: Record<string, any> = {};
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