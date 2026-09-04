import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const AUTH_SELECT =
  "id, patient_id, provider_id, policy_id, authorization_number, service_type, service_description, estimated_amount, status, approved_amount, valid_until, notes, requested_by, approved_by, created_at, updated_at, patients!insurance_authorizations_patient_id_fkey(id, first_name, last_name, patient_number), insurance_providers!insurance_authorizations_provider_id_fkey(id, name, provider_type), insurance_policies!insurance_authorizations_policy_id_fkey(id, policy_number, plan_name)";

function idFrom(req: NextRequest): string {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  return segs[segs.length - 1];
}

// GET /api/insurance/authorizations/[id]
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = idFrom(req);

  const { data, error } = await ctx.svc
    .from("insurance_authorizations")
    .select(AUTH_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new ValidationError(error.message);
  if (!data) throw new NotFoundError("Authorization not found");
  return ok(data);
});

// PUT /api/insurance/authorizations/[id]
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = idFrom(req);
  const body = await req.json();

  const { data: existing } = await ctx.svc
    .from("insurance_authorizations")
    .select("id, status, authorization_number")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!existing) throw new NotFoundError("Authorization not found");

  const patch: Record<string, any> = {};
  if (body.status !== undefined) {
    if (!["pending", "approved", "rejected", "expired", "used"].includes(body.status)) {
      throw new ValidationError("Status must be pending, approved, rejected, expired, or used");
    }
    patch.status = body.status;
  }
  if (body.authorizationNumber !== undefined) {
    patch.authorization_number = body.authorizationNumber?.trim() || null;
  }
  if (body.approvedAmount !== undefined) {
    const a = Number(body.approvedAmount);
    if (body.approvedAmount !== null && body.approvedAmount !== "" && (!Number.isFinite(a) || a < 0)) {
      throw new ValidationError("Approved amount must be a non-negative number");
    }
    patch.approved_amount = body.approvedAmount === null || body.approvedAmount === "" ? null : a;
  }
  if (body.validUntil !== undefined) patch.valid_until = body.validUntil?.trim() || null;
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;
  if (body.serviceDescription !== undefined) patch.service_description = body.serviceDescription?.trim() || null;
  if (body.serviceType !== undefined) patch.service_type = body.serviceType?.trim();

  // Auto-set approved_by when approving
  if (patch.status === "approved" && !patch.approved_by) {
    patch.approved_by = ctx.user.id;
  }

  if (Object.keys(patch).length === 0) {
    throw new ValidationError("No fields to update");
  }

  const { data, error } = await ctx.svc
    .from("insurance_authorizations")
    .update(patch)
    .eq("id", id)
    .select(AUTH_SELECT)
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "insurance_authorizations",
    entityId: id,
    description: `Updated authorization ${existing.authorization_number ?? id}: status → ${patch.status ?? existing.status}`,
  });

  return ok(data);
});

// DELETE /api/insurance/authorizations/[id] — reject instead of delete
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = idFrom(req);

  const { data: existing } = await ctx.svc
    .from("insurance_authorizations")
    .select("id, status, authorization_number")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!existing) throw new NotFoundError("Authorization not found");

  if (existing.status === "rejected") {
    throw new ValidationError("Authorization is already rejected");
  }

  const { data, error } = await ctx.svc
    .from("insurance_authorizations")
    .update({ status: "rejected", notes: "Rejected via delete" })
    .eq("id", id)
    .select(AUTH_SELECT)
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "insurance_authorizations",
    entityId: id,
    description: `Authorization ${existing.authorization_number ?? id} rejected`,
  });

  return ok(data);
});

export const runtime = "nodejs";
