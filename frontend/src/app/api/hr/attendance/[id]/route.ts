import { withStaff, ok, ValidationError, ForbiddenError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PUT /api/hr/attendance/[id] — manual correction (HR admin).
// DELETE /api/hr/attendance/[id] — remove a row (HR admin).
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");
  const body = await req.json().catch(() => null);

  const patch: Record<string, unknown> = {};
  if (body?.status != null) {
    const status = String(body.status).trim();
    if (!["present", "absent", "late", "on_leave"].includes(status)) throw new ValidationError("Invalid status");
    patch.status = status;
  }
  if (body?.check_in != null) patch.check_in = body.check_in;
  if (body?.check_out != null) patch.check_out = body.check_out;
  if (body?.notes != null) patch.notes = String(body.notes).trim() || null;

  const { data, error } = await ctx.svc
    .from("attendance")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();
  if (error) throw new ValidationError(error.message);
  if (!data) throw new NotFoundError("Attendance record not found");

  await logAudit(req, ctx, { action: "update", entityType: "attendance", entityId: id, changes: patch, description: "Corrected attendance" });
  return ok(data);
});

export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");

  const { data, error } = await ctx.svc
    .from("attendance")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();
  if (error) throw new ValidationError(error.message);
  if (!data) throw new NotFoundError("Attendance record not found");

  await logAudit(req, ctx, { action: "delete", entityType: "attendance", entityId: id, description: "Deleted attendance record" });
  return ok({ deleted: true });
});
