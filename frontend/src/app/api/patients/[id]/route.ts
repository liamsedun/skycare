import { withStaff, ok, ValidationError, ForbiddenError, NotFoundError, requireTenant, requireModuleLevel } from "@/lib/api-utils";
import { logAudit, logView } from "@/lib/audit";
import { normalizeBloodGroup } from "@/app/api/patients/route";
import { syncPortalAccountEmail } from "@/lib/dependant-portal";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function getPatient(ctx: any, id: string, tenantId: string | null) {
  let query = ctx.svc
    .from("patients")
    .select(
      "*, dependants:patients!primary_account_id(id, patient_number, first_name, last_name, gender, date_of_birth, phone, email, address, city, state, emergency_contact_name, emergency_contact_phone, dependant_relationship, status, user_id)"
    )
    .eq("id", id);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data } = await query.maybeSingle();
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
  await requireModuleLevel(ctx, "patients", "full");
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getPatient(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Patient not found");

  const body = (await req.json()) as Record<string, unknown>;
  const allowed = [
    "first_name", "last_name", "other_names", "gender", "date_of_birth", "phone", "email",
    "address", "city", "state", "blood_group", "genotype", "allergies", "chronic_conditions",
    "nhia_number", "insurance_provider", "insurance_plan", "is_insured", "next_of_kin", "status",
    "marital_status", "height_cm", "weight_kg", "emergency_contact_name", "emergency_contact_phone",
  ];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if (patch.blood_group !== undefined) {
    patch.blood_group = normalizeBloodGroup(patch.blood_group as string | null | undefined);
  }
  if (patch.marital_status !== undefined) {
    const ms = String(patch.marital_status ?? "").trim();
    patch.marital_status = ms ? ms.toLowerCase() : "single";
  }
  if (typeof patch.email === "string") {
    const em = patch.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new ValidationError("Invalid email address");
    patch.email = em;
  }
  if (Object.keys(patch).length === 0) return ok(existing);

  // If the patient has a portal login, keep its email in sync (auth + users
  // mirror) so a corrected address actually changes what they log in with.
  if (existing.user_id && typeof patch.email === "string") {
    try {
      await syncPortalAccountEmail(ctx.svc, existing.user_id, patch.email);
    } catch (e) {
      throw new ValidationError(e instanceof Error ? e.message : "Failed to update portal login email");
    }
  }

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
    description: `Updated patient ${existing.patient_number}` + (typeof patch.email === "string" ? " (portal login email synced)" : ""),
  });
  return ok(data);
});

// POST /api/patients/[id]/transfer — mark patient as transferred to another hospital (soft: keep record, disable portal)
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  await requireModuleLevel(ctx, "patients", "full");
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getPatient(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Patient not found");

  const { data, error } = await ctx.svc
    .from("patients")
    .update({ status: "transferred" })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  // Disable the portal login — the patient is leaving this hospital.
  if (existing.user_id) {
    await ctx.svc.from("users").update({ is_active: false }).eq("id", existing.user_id);
  }

  await logAudit(req, ctx, {
    action: "update",
    entityType: "patients",
    entityId: id,
    description: `Transferred patient ${existing.patient_number} to another hospital`,
  });
  return ok(data);
});

// DELETE /api/patients/[id] — permanent removal from the system.
// hospital_admin only. All child rows (records, notes, reports,
// invoices, payments, appointments, chats, dependants) are removed via
// ON DELETE CASCADE on patients(id).
export const DELETE = withStaff(async (req, ctx) => {
  if (ctx.role !== "hospital_admin") {
    throw new ForbiddenError("Admin access required");
  }
  const tenantId = requireTenant(ctx);
  await requireModuleLevel(ctx, "patients", "full");
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getPatient(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Patient not found");

  // Collect every linked portal account (primary + dependants) so we can
  // remove the logins too, not just the patient rows.
  const linkedUserIds: string[] = [];
  if (existing.user_id) linkedUserIds.push(existing.user_id);
  for (const d of existing.dependants ?? []) {
    if (d.user_id && !linkedUserIds.includes(d.user_id)) linkedUserIds.push(d.user_id);
  }

  let del = ctx.svc.from("patients").delete().eq("id", id);
  if (tenantId) del = del.eq("tenant_id", tenantId);
  const { error } = await del;
  if (error) throw new ValidationError(error.message);

  // Remove portal accounts completely (auth + mirror users row).
  for (const uid of linkedUserIds) {
    try {
      await ctx.svc.auth.admin.deleteUser(uid);
    } catch {
      /* auth row may already be gone */
    }
    try {
      await ctx.svc.from("users").delete().eq("id", uid);
    } catch {
      await ctx.svc.from("users").update({ is_active: false }).eq("id", uid);
    }
  }

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "patients",
    entityId: id,
    description: `Permanently deleted patient ${existing.patient_number} (${existing.first_name} ${existing.last_name})`,
  });
  return ok({ deleted: true });
});

export const runtime = "nodejs";
