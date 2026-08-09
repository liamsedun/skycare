import { withStaff, ok, ValidationError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

// GET /api/hr/shifts — shift templates (any staff).
// POST /api/hr/shifts — create template (HR admin).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { data, error } = await ctx.svc
    .from("shifts")
    .select("id, name, start_time, end_time, department, ward_id, color, is_active, ward:wards(name)")
    .eq("tenant_id", tenantId)
    .order("start_time");
  if (error) throw new ValidationError(error.message);
  return ok(data ?? []);
});

export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const startTime = String(body?.start_time ?? "").trim();
  const endTime = String(body?.end_time ?? "").trim();
  if (!name) throw new ValidationError("Shift name is required");
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
    throw new ValidationError("start_time and end_time must be HH:MM");
  }

  const { data, error } = await ctx.svc
    .from("shifts")
    .insert({
      tenant_id: tenantId,
      branch_id: ctx.branchId ?? null,
      name,
      start_time: startTime,
      end_time: endTime,
      department: String(body?.department ?? "").trim() || null,
      ward_id: body?.ward_id ?? null,
      color: String(body?.color ?? "#0ea5e9").trim(),
      created_by: ctx.user.id,
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "shifts",
    entityId: data.id,
    changes: { name, start_time: startTime, end_time: endTime },
    description: `Created shift template ${name}`,
  });
  return ok(data, 201);
});
