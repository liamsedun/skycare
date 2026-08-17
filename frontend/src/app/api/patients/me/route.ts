import { withAuth, ok, ForbiddenError, NotFoundError, ValidationError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PATIENT_EDIT_FIELDS = [
  "date_of_birth",
  "marital_status",
  "blood_group",
  "genotype",
  "medical_plan",
  "address",
  "city",
  "state",
  "allergies",
  "chronic_conditions",
] as const;

const MEDICAL_PLANS = ["individual", "family", "organisation", "hmo"];

// GET /api/patients/me — patient portal helper: returns the caller's own patient
// record plus the family root and dependant list. Patient_api only.
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (ctx.role !== "patient_api") {
    throw new ForbiddenError("This endpoint is for patient portal accounts only");
  }

  const { data: self } = await ctx.svc
    .from("patients")
    .select("id, primary_account_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (!self) throw new NotFoundError("Patient profile not found");

  const rootId = self.primary_account_id ?? self.id;

  const { data: family } = await ctx.svc
    .from("patients")
    .select("id, patient_number, first_name, last_name, gender, date_of_birth, phone, email, dependant_relationship, is_primary_account, status, user_id, marital_status, blood_group, genotype, allergies, chronic_conditions, medical_plan, address, city, state, emergency_contact_name, emergency_contact_phone, avatar_url, created_at, users(avatar_url)")
    .eq("tenant_id", tenantId)
    .or(`id.eq.${rootId},primary_account_id.eq.${rootId}`)
    .order("is_primary_account", { ascending: false })
    .order("created_at", { ascending: true });

  // Portal profile photos live on users.avatar_url (uploaded via /api/uploads/avatar);
  // patients.avatar_url wins when set (family-page uploads), else fall back to the
  // linked portal account's photo so the primary's card shows their photo, not initials.
  const familyRows = (family ?? []).map((row) => {
    const r = row as Record<string, unknown> & { users?: { avatar_url?: string | null } | null };
    const { users: linkedUser, ...rest } = r;
    return {
      ...rest,
      avatar_url: (rest.avatar_url as string | null | undefined) ?? linkedUser?.avatar_url ?? null,
    };
  });

  return ok({ selfId: self.id, rootId, family: familyRows });
});

// PUT /api/patients/me — the caller updates their own patient record fields
export const PUT = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (ctx.role !== "patient_api") {
    throw new ForbiddenError("This endpoint is for patient portal accounts only");
  }

  const { data: self } = await ctx.svc
    .from("patients")
    .select("id, patient_number")
    .eq("tenant_id", tenantId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (!self) throw new NotFoundError("Patient profile not found");

  const body = (await req.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of PATIENT_EDIT_FIELDS) {
    if (key in body) patch[key] = body[key];
  }

  // Staff may record custom values ("add others") for these clinical fields,
  // so patients editing their own profile can keep them rather than being
  // forced back to the canonical list.
  if (patch.marital_status !== undefined && patch.marital_status !== null) {
    const ms = String(patch.marital_status).trim();
    if (ms) patch.marital_status = ms;
    else patch.marital_status = "single";
  }
  if (patch.blood_group !== undefined && patch.blood_group !== null) {
    const bg = String(patch.blood_group).trim().toUpperCase().replace(/0/g, "O");
    patch.blood_group = bg || null;
  }
  if (patch.genotype !== undefined && patch.genotype !== null) {
    const gt = String(patch.genotype).trim().toUpperCase();
    patch.genotype = gt || null;
  }
  if (patch.medical_plan !== undefined && !MEDICAL_PLANS.includes(patch.medical_plan as string)) {
    throw new ValidationError("Invalid medical plan");
  }
  if (Object.keys(patch).length === 0) return ok({ ok: true });

  const { data, error } = await ctx.svc
    .from("patients")
    .update(patch)
    .eq("id", self.id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "patients",
    entityId: self.id,
    description: `Updated own profile (${self.patient_number})`,
  });

  return ok(data);
});

export const runtime = "nodejs";
