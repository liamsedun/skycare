import { withStaff, ok, ValidationError, requireTenant, ForbiddenError, isAdminRole } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/beds?ward_id=&status= — beds with ward info + occupant (staff).
// POST /api/beds — create a bed (hospital_admin / super_admin).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const sp = req.nextUrl.searchParams;
  const wardId = sp.get("ward_id")?.trim() || null;
  const status = sp.get("status")?.trim() || null;

  let query = ctx.svc
    .from("beds")
    .select(
      "id, ward_id, bed_number, status, created_at, updated_at, " +
      "ward!inner(id, name, ward_type, branch_id, tenant_id)"
    )
    .eq("ward.tenant_id", tenantId);
  if (wardId) query = query.eq("ward_id", wardId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("bed_number");
  if (error) throw new Error(error.message);
  // Only beds whose ward belongs to this tenant.
  const rows = (data ?? []).filter((b: any) => b.ward?.tenant_id === tenantId);
  return ok(rows);
});

export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isAdminRole(ctx.role)) {
    throw new ForbiddenError("Only administrators can add beds");
  }
  const body = await req.json().catch(() => null);
  const wardId = body?.ward_id ?? null;
  const bedNumber = String(body?.bed_number ?? "").trim();
  if (!wardId) throw new ValidationError("ward_id is required");
  if (!bedNumber) throw new ValidationError("Bed number is required");

  // The ward must belong to this tenant.
  const { data: ward, error: wErr } = await ctx.svc
    .from("wards")
    .select("id, tenant_id, name")
    .eq("id", wardId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (wErr || !ward) throw new ValidationError("Ward not found in your tenant");

  const { data, error } = await ctx.svc
    .from("beds")
    .insert({ ward_id: wardId, bed_number: bedNumber })
    .select("id, ward_id, bed_number, status, created_at, updated_at")
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "beds",
    entityId: data?.id ?? null,
    changes: { ward_id: wardId, bed_number: bedNumber },
    description: `Added bed ${bedNumber} to ${ward.name}`,
  });
  return ok(data);
});