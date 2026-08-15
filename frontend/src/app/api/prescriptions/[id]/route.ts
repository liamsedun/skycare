import { withAuth, withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { CLINICIAN_ROLES } from "@/lib/auth";
import { logAudit, logView } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const RX_SELECT =
  "id, tenant_id, branch_id, patient_id, doctor_id, visit_id, diagnosis, notes, status, pharmacy_type, external_pharmacy_name, dispensed_at, dispensed_by, issued_date, expires_date, created_at, updated_at, patients(id, patient_number, first_name, last_name), users!prescriptions_doctor_id_fkey(id, full_name, role), prescription_items(id, drug_id, pharmacy_drug_id, medication_name, dosage, frequency, route, duration, quantity, refills, dispensed_qty, instructions)";

async function getPrescription(ctx: any, id: string, tenantId: string) {
  const { data } = await ctx.svc
    .from("prescriptions")
    .select(RX_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

// GET /api/prescriptions/[id]
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const rx = await getPrescription(ctx, id, tenantId);
  if (!rx) throw new NotFoundError("Prescription not found");
  if (ctx.role === "patient_api") {
    const { data } = await ctx.svc
      .from("patients")
      .select("id, primary_account_id")
      .eq("user_id", ctx.user.id);
    const ids = new Set<string>();
    for (const row of data ?? []) {
      ids.add(row.id);
      if (row.primary_account_id) ids.add(row.primary_account_id);
    }
    if (!ids.has(rx.patient_id)) throw new NotFoundError("Prescription not found");
  }
  await logView(req, ctx, "prescriptions", id, `Viewed prescription for patient`);
  return ok(rx);
});

const ALLOWED_STATUSES = ["pending", "processing", "dispensed", "partial", "cancelled", "completed"];

// Items may only be added/removed/changed while nothing has been dispensed —
// once a single unit has moved, the stock ledger owns the rest of the story.
const ITEM_EDITABLE_STATUSES = ["pending", "processing"];

interface EditItemBody {
  id?: string;
  medicationName: string;
  drugId?: string;
  pharmacyDrugId?: string;
  dosage: string;
  frequency: string;
  route?: string;
  duration?: string;
  quantity?: number;
  refills?: number;
  instructions?: string;
}

// PUT /api/prescriptions/[id] — metadata + lifecycle transitions + item edits.
// When `items` is sent it is the FULL replacement list: rows without an id are
// inserted, rows with an id are updated in place, existing items absent from
// the list are deleted. Dispensing itself lives at POST /api/prescriptions/[id]/dispense.
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getPrescription(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Prescription not found");

  const body = (await req.json()) as Record<string, unknown>;
  const allowed = ["diagnosis", "notes", "status", "expires_date"];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key] ?? null;
  }
  if (patch.status && !ALLOWED_STATUSES.includes(patch.status as string)) {
    throw new ValidationError("Invalid prescription status");
  }

  if (body.patientId) {
    const { data: patient } = await ctx.svc
      .from("patients")
      .select("id, first_name, last_name")
      .eq("id", body.patientId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!patient) throw new ValidationError("Invalid patient selected");
    patch.patient_id = body.patientId;
  }
  if (body.doctorId) {
    const { data: doctor } = await ctx.svc
      .from("users")
      .select("id, role")
      .eq("id", body.doctorId)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();
    if (!doctor || !["hospital_admin", "nurse", ...CLINICIAN_ROLES].includes(doctor.role)) {
      throw new ValidationError("Invalid doctor selected");
    }
    patch.doctor_id = body.doctorId;
  }

  const existingItems = (existing.prescription_items ?? []) as Array<{ id: string; dispensed_qty: number }>;
  const hasDispensed = existingItems.some((i) => (i.dispensed_qty ?? 0) > 0);

  let incomingItems: EditItemBody[] | null = null;
  if ("items" in body) {
    if (!ITEM_EDITABLE_STATUSES.includes(existing.status)) {
      throw new ValidationError("Items can only be edited while the prescription is pending or processing");
    }
    if (hasDispensed) {
      throw new ValidationError("Cannot edit items once any quantity has been dispensed");
    }
    const items = body.items as unknown;
    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationError("At least one medication is required");
    }
    incomingItems = items as EditItemBody[];
    for (const it of incomingItems) {
      if (!it.medicationName?.trim()) throw new ValidationError("Each medication needs a name");
    }
    if (incomingItems.some((i) => i.pharmacyDrugId)) {
      const { data: matched } = await ctx.svc
        .from("pharmacy_drugs")
        .select("id")
        .in("id", incomingItems.map((i) => i.pharmacyDrugId).filter(Boolean) as string[]);
      const found = new Set((matched ?? []).map((d: { id: string }) => d.id));
      for (const it of incomingItems) {
        if (it.pharmacyDrugId && !found.has(it.pharmacyDrugId)) {
          throw new ValidationError(`Pharmacy drug not found: ${it.medicationName}`);
        }
      }
    }
    const existingIds = new Set(existingItems.map((i) => i.id));
    for (const it of incomingItems) {
      if (it.id && !existingIds.has(it.id)) {
        throw new ValidationError("Prescription item does not belong to this prescription");
      }
    }
  }

  const { data: updated, error } = await ctx.svc
    .from("prescriptions")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  if (incomingItems) {
    const keptIds = new Set(incomingItems.filter((i) => i.id).map((i) => i.id!));
    const toInsert = incomingItems.filter((i) => !i.id);
    const toDelete = existingItems.filter((i) => !keptIds.has(i.id));

    for (const item of toDelete) {
      const { error: delError } = await ctx.svc.from("prescription_items").delete().eq("id", item.id);
      if (delError) throw new ValidationError(delError.message);
    }
    if (toInsert.length > 0) {
      const rows = toInsert.map((item) => ({
        prescription_id: id,
        drug_id: item.drugId || null,
        pharmacy_drug_id: item.pharmacyDrugId || null,
        medication_name: item.medicationName?.trim() || null,
        dosage: item.dosage?.trim() || "1",
        frequency: item.frequency?.trim() || "1x daily",
        route: item.route?.trim() || "oral",
        duration: item.duration?.trim() || null,
        quantity: item.quantity ?? 0,
        refills: item.refills ?? 0,
        instructions: item.instructions?.trim() || null,
      }));
      const { error: insError } = await ctx.svc.from("prescription_items").insert(rows);
      if (insError) throw new ValidationError(insError.message);
    }
    const toUpdate = incomingItems.filter((i) => i.id);
    for (const item of toUpdate) {
      const { error: updError } = await ctx.svc
        .from("prescription_items")
        .update({
          drug_id: item.drugId || null,
          pharmacy_drug_id: item.pharmacyDrugId || null,
          medication_name: item.medicationName?.trim() || null,
          dosage: item.dosage?.trim() || "1",
          frequency: item.frequency?.trim() || "1x daily",
          route: item.route?.trim() || "oral",
          duration: item.duration?.trim() || null,
          quantity: item.quantity ?? 0,
          refills: item.refills ?? 0,
          instructions: item.instructions?.trim() || null,
        })
        .eq("id", item.id!);
      if (updError) throw new ValidationError(updError.message);
    }
  }

  await logAudit(req, ctx, {
    action: "update",
    entityType: "prescriptions",
    entityId: id,
    description: patch.status ? `Prescription status set to ${patch.status}` : "Prescription updated",
  });

  const fresh = await getPrescription(ctx, id, tenantId);
  return ok(fresh ?? updated);
});

// DELETE /api/prescriptions/[id] — remove the prescription and its items.
// Guarded: nothing may have been dispensed and the prescription must not be
// in a terminal dispensed/completed state.
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getPrescription(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Prescription not found");

  const existingItems = (existing.prescription_items ?? []) as Array<{ dispensed_qty: number }>;
  if (existingItems.some((i) => (i.dispensed_qty ?? 0) > 0)) {
    throw new ValidationError("Cannot delete a prescription that has dispensed quantities");
  }
  if (["dispensed", "partial", "completed"].includes(existing.status)) {
    throw new ValidationError("Cannot delete a dispensed or completed prescription");
  }

  const { error } = await ctx.svc.from("prescriptions").delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "prescriptions",
    entityId: id,
    description: `Deleted prescription for ${existing.patients ? `${existing.patients.first_name} ${existing.patients.last_name}` : "patient"}`,
  });

  return ok({ ok: true });
});

export const runtime = "nodejs";
