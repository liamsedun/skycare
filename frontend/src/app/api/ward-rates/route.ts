import { withStaff, ok, ValidationError, requireTenant, ForbiddenError, isAdminRole } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// PUT /api/ward-rates — set the daily accommodation rate for a ward
// (hospital_admin). Also accepts create-on-first-use.
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isAdminRole(ctx.role)) {
    throw new ForbiddenError("Only administrators can set ward rates");
  }
  const body = await req.json().catch(() => null);
  const wardId = body?.ward_id ?? body?.wardId ?? null;
  const rate = Number(body?.rate ?? 0);
  if (!wardId) throw new ValidationError("ward_id is required");
  if (!Number.isFinite(rate) || rate < 0) throw new ValidationError("Rate must be a non-negative number");

  const { data: ward, error: wErr } = await ctx.svc
    .from("wards")
    .select("id, tenant_id, name")
    .eq("id", wardId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (wErr || !ward) throw new ValidationError("Ward not found in your tenant");

  const { data, error } = await ctx.svc
    .from("ward_daily_rates")
    .upsert({ tenant_id: tenantId, ward_id: wardId, rate }, { onConflict: "tenant_id,ward_id" })
    .select("id, ward_id, rate")
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "ward_daily_rates",
    entityId: data?.id ?? null,
    changes: { ward_id: wardId, rate },
    description: `Set daily accommodation rate for ${ward.name} to ${rate}`,
  });
  return ok(data);
});