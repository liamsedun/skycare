import { withStaff, ok, ValidationError, requireTenant, ForbiddenError, CLINICAL_ROLES } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/discharges — discharge an active admission via ward_discharge.
// Requires a summary. hospital_admin / doctor / nurse / super_admin.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!CLINICAL_ROLES.includes(ctx.role ?? "receptionist")) {
    throw new ForbiddenError("Only clinical staff can discharge patients");
  }
  const body = await req.json().catch(() => null);
  const admissionId = body?.admission_id ?? body?.admissionId ?? null;
  const summary = String(body?.summary ?? "").trim();
  if (!admissionId) throw new ValidationError("admission_id is required");
  if (!summary) throw new ValidationError("Discharge summary is required");

  const { data, error } = await ctx.svc.rpc("ward_discharge", {
    p_tenant: tenantId,
    p_admission_id: admissionId,
    p_summary: summary,
    p_medications: body?.medications ?? [],
    p_follow_up: body?.follow_up ?? body?.followUp ?? null,
    p_by: ctx.user.id,
  });
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "admissions",
    entityId: data ?? null,
    changes: { status: "discharged", summary },
    description: "Discharged patient from ward",
  });
  return ok(data);
});