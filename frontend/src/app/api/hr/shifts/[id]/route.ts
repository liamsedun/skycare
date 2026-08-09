import { withStaff, ok, ValidationError, ForbiddenError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

// PUT /api/hr/shifts/[id] — update template (HR admin).
// DELETE /api/hr/shifts/[id] — remove template (blocked while assigned; HR admin).
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");
  const body = await req.json().catch(() => null);

  const patch: Record<string, unknown> = {
    name: String(body?.name ?? "").trim(),
    department: String(body?.department ?? "").trim() || null,
    ward_id: body?.ward_id ?? null,
    color: String(body?.color ?? "#0ea5e9").trim(),
    is_active: body?.is_active ?? true,
  };
  if (body?.start_time != null) {
    if (!TIME_RE.test(String(body.start_time).trim())) throw new ValidationError("start_time must be HH:MM");
    patch.start_time = String(body.start_time).trim();
  }
  if (body?.end_time != null) {
    if (!TIME_RE.test(String(body.end_time).trim())) throw new ValidationError("end_time must be HH:MM");
    patch.end_time = String(body.end_time).trim();
  }
  if (!String(patch.name).trim()) throw new ValidationError("Shift name is required");

  const { data, error } = await ctx.svc
    .from("shifts")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();
  if (error) throw new ValidationError(error.message);
  if (!data) throw new NotFoundError("Shift template not found");

  await logAudit(req, ctx, { action: "update", entityType: "shifts", entityId: id, description: `Updated shift template ${data.name}` });
  return ok(data);
});

export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");

  const { count } = await ctx.svc
    .from("staff_shifts")
    .select("id", { count: "exact", head: true })
    .eq("shift_id", id)
    .eq("tenant_id", tenantId);
  if ((count ?? 0) > 0) throw new ValidationError("This shift template is assigned to staff; remove the assignments first");

  const { error } = await ctx.svc.from("shifts").delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, { action: "delete", entityType: "shifts", entityId: id, description: "Deleted shift template" });
  return ok({ deleted: true });
});
