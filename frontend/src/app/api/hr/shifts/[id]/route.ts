import { withStaff, ok, ValidationError, ForbiddenError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

// PUT /api/hr/shifts/[id] — update a shift template (HR admin).
// DELETE /api/hr/shifts/[id] — remove a template (HR admin; assignments keep
//   their rows, the shift reference goes null via ON DELETE SET NULL).
export const PUT = withStaff(async (req: NextRequest, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");
  const id = req.nextUrl.pathname.split("/").filter(Boolean).pop() ?? "";
  if (!id) throw new ValidationError("Shift id is required");

  const { data: existing, error: getErr } = await ctx.svc
    .from("shifts")
    .select("id, name, start_time, end_time, department, color, is_active")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (getErr) throw new ValidationError(getErr.message);
  if (!existing) throw new NotFoundError("Shift template not found");

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? existing.name).trim() || existing.name;
  const startTime = String(body?.start_time ?? existing.start_time).trim();
  const endTime = String(body?.end_time ?? existing.end_time).trim();
  if (!name) throw new ValidationError("Shift name is required");
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
    throw new ValidationError("start_time and end_time must be HH:MM");
  }

  const { data: dup, error: dupErr } = await ctx.svc
    .from("shifts")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("name", name)
    .neq("id", id)
    .maybeSingle();
  if (dupErr) throw new ValidationError(dupErr.message);
  if (dup) throw new ValidationError("A shift template with this name already exists");

  const patch: Record<string, unknown> = { name, start_time: startTime, end_time: endTime };
  if (body?.department !== undefined) patch.department = String(body.department).trim() || null;
  if (body?.color !== undefined) patch.color = String(body.color ?? "#0ea5e9").trim();
  if (body?.is_active !== undefined) patch.is_active = Boolean(body.is_active);

  const { data, error } = await ctx.svc.from("shifts").update(patch).eq("id", id).eq("tenant_id", tenantId).select().single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "shifts",
    entityId: data.id,
    changes: { name, start_time: startTime, end_time: endTime },
    description: `Updated shift template ${name}`,
  });
  return ok(data);
});

export const DELETE = withStaff(async (req: NextRequest, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");
  const id = req.nextUrl.pathname.split("/").filter(Boolean).pop() ?? "";
  if (!id) throw new ValidationError("Shift id is required");

  const { data: existing, error: getErr } = await ctx.svc
    .from("shifts")
    .select("id, name")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (getErr) throw new ValidationError(getErr.message);
  if (!existing) throw new NotFoundError("Shift template not found");

  const { error } = await ctx.svc.from("shifts").delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "shifts",
    entityId: id,
    changes: { name: existing.name },
    description: `Deleted shift template ${existing.name}`,
  });
  return ok({ id });
});