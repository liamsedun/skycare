import { withStaff, ok, ValidationError, requireTenant, ForbiddenError, isAdminRole } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["general", "private", "icu", "maternity", "surgical", "pediatric", "observation"];

// PATCH /api/wards/[id] — update ward name / type / active (hospital_admin).
export const PATCH = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isAdminRole(ctx.role)) {
    throw new ForbiddenError("Only administrators can update wards");
  }
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  const id = segs[segs.length - 1];

  const { data: ward } = await ctx.svc
    .from("wards")
    .select("id, name")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!ward) throw new ValidationError("Ward not found in your tenant");

  const body = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};
  if ("name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name) throw new ValidationError("Ward name is required");
    patch.name = name;
  }
  if ("ward_type" in body) {
    const wardType = String(body.ward_type ?? "general").trim();
    if (!VALID_TYPES.includes(wardType)) throw new ValidationError("Invalid ward type");
    patch.ward_type = wardType;
  }
  if ("is_active" in body) {
    if (typeof body.is_active !== "boolean") throw new ValidationError("is_active must be a boolean");
    patch.is_active = body.is_active;
  }
  if (Object.keys(patch).length === 0) return ok(ward);

  const { data, error } = await ctx.svc
    .from("wards")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "wards",
    entityId: id,
    changes: patch,
    description: `Updated ward ${ward.name}`,
  });
  return ok(data);
});

export const runtime = "nodejs";