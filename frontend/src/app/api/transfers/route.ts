import { withStaff, ok, ValidationError, requireTenant, ForbiddenError, CLINICAL_ROLES } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/transfers — move an active admission to another bed via
// ward_transfer. hospital_admin / doctor / nurse.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!CLINICAL_ROLES.includes(ctx.role ?? "receptionist")) {
    throw new ForbiddenError("Only clinical staff can transfer patients");
  }
  const body = await req.json().catch(() => null);
  const admissionId = body?.admission_id ?? body?.admissionId ?? null;
  const toBedId = body?.to_bed_id ?? body?.toBedId ?? null;
  if (!admissionId || !toBedId) throw new ValidationError("admission_id and to_bed_id are required");

  const { data, error } = await ctx.svc.rpc("ward_transfer", {
    p_tenant: tenantId,
    p_admission_id: admissionId,
    p_to_bed_id: toBedId,
    p_reason: body?.reason ?? null,
    p_by: ctx.user.id,
  });
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "admissions",
    entityId: data ?? null,
    changes: { to_bed_id: toBedId, reason: body?.reason ?? null },
    description: "Transferred patient to another bed",
  });
  return ok(data);
});