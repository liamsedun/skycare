import { withStaff, ok, ValidationError, ForbiddenError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PUT /api/hr/roster/[id] — update assignment status/notes (HR admin).
// DELETE /api/hr/roster/[id] — unassign (HR admin).
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");
  const body = await req.json().catch(() => null);

  const patch: Record<string, unknown> = {};
  if (body?.status != null) {
    const status = String(body.status).trim();
    if (!["scheduled", "completed", "missed", "cancelled"].includes(status)) {
      throw new ValidationError("Invalid status");
    }
    patch.status = status;
  }
  if (body?.notes != null) patch.notes = String(body.notes).trim() || null;

  const { data, error } = await ctx.svc
    .from("staff_shifts")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();
  if (error) throw new ValidationError(error.message);
  if (!data) throw new NotFoundError("Assignment not found");

  await logAudit(req, ctx, { action: "update", entityType: "staff_shifts", entityId: id, changes: patch, description: "Updated shift assignment" });
  return ok(data);
});

export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");

  const { data, error } = await ctx.svc
    .from("staff_shifts")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();
  if (error) throw new ValidationError(error.message);
  if (!data) throw new NotFoundError("Assignment not found");

  await logAudit(req, ctx, { action: "delete", entityType: "staff_shifts", entityId: id, description: "Removed shift assignment" });
  return ok({ deleted: true });
});
