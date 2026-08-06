import { withStaff, ok, ValidationError, ForbiddenError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit, logView } from "@/lib/audit";
import { normalizeBloodGroup } from "@/app/api/patients/route";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function getPatient(ctx: any, id: string, tenantId: string) {
  const { data } = await ctx.svc
    .from("patients")
    .select(
      "*, dependants:patients!primary_account_id(id, patient_number, first_name, last_name, gender, date_of_birth, phone, dependant_relationship, status, user_id)"
    )
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

// GET /api/patients/[id] — single patient + dependants (logs a VIEW audit)
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const patient = await getPatient(ctx, id, tenantId);
  if (!patient) throw new NotFoundError("Patient not found");
  await logView(req, ctx, "patients", patient.id, `Viewed patient ${patient.patient_number}`);
  return ok(patient);
});

// PUT /api/patients/[id]
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getPatient(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Patient not found");

  const body = (await req.json()) as Record<string, unknown>;
  const allowed = [
    "first_name", "last_name", "other_names", "gender", "date_of_birth", "phone", "email",
    "address", "city", "state", "blood_group", "genotype", "allergies", "chronic_conditions",
    "nhia_number", "insurance_provider", "insurance_plan", "is_insured", "next_of_kin", "status",
    "marital_status",
  ];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if (patch.blood_group !== undefined) {
    patch.blood_group = normalizeBloodGroup(patch.blood_group as string | null | undefined);
    if (body.blood_group && String(body.blood_group).trim() && !patch.blood_group) {
      throw new ValidationError(
        `Invalid blood group "${body.blood_group}". Use one of: A+, A-, B+, B-, AB+, AB-, O+, O-.`
      );
    }
  }
  if (patch.marital_status !== undefined) {
    const ms = String(patch.marital_status ?? "").trim();
    if (!ms) patch.marital_status = "single";
  }
  if (Object.keys(patch).length === 0) return ok(existing);

  const { data, error } = await ctx.svc
    .from("patients")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "patients",
    entityId: id,
    description: `Updated patient ${existing.patient_number}`,
  });
  return ok(data);
});

// DELETE /api/patients/[id] — soft delete (status = transferred)
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getPatient(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Patient not found");

  const { data } = await ctx.svc
    .from("patients")
    .update({ status: "transferred" })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  // If the patient had a portal account, disable it.
  if (existing.user_id) {
    await ctx.svc
      .from("users")
      .update({ is_active: false })
      .eq("id", existing.user_id);
  }

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "patients",
    entityId: id,
    description: `Removed patient ${existing.patient_number}`,
  });
  return ok(data);
});

export const runtime = "nodejs";
