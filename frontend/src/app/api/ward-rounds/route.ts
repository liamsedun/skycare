import { withStaff, ok, ValidationError, requireTenant, ForbiddenError, CLINICAL_ROLES } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/ward-rounds?admission_id= — ward round entries (staff).
// POST /api/ward-rounds — add a round via ward_round_add
// (hospital_admin / doctor / nurse).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const sp = req.nextUrl.searchParams;
  const admissionId = sp.get("admission_id")?.trim() || null;

  let query = ctx.svc
    .from("ward_rounds")
    .select("id, admission_id, patient_id, doctor_id, notes, vitals, medications, round_time, created_at")
    .eq("tenant_id", tenantId);
  if (admissionId) query = query.eq("admission_id", admissionId);
  const { data, error } = await query.order("round_time", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return ok(data ?? []);
});

export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!CLINICAL_ROLES.includes(ctx.role ?? "receptionist")) {
    throw new ForbiddenError("Only clinical staff can add ward rounds");
  }
  const body = await req.json().catch(() => null);
  const admissionId = body?.admission_id ?? body?.admissionId ?? null;
  const notes = String(body?.notes ?? "").trim();
  if (!admissionId) throw new ValidationError("admission_id is required");
  if (!notes) throw new ValidationError("Round notes are required");

  const { data, error } = await ctx.svc.rpc("ward_round_add", {
    p_tenant: tenantId,
    p_admission_id: admissionId,
    p_notes: notes,
    p_vitals: body?.vitals ?? {},
    p_medications: body?.medications ?? [],
    p_doctor: ctx.user.id,
  });
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "ward_rounds",
    entityId: data ?? null,
    changes: { admission_id: admissionId },
    description: "Added ward round entry",
  });
  return ok(data);
});