import { withAuth, withStaff, okPaginated, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { CLINICIAN_ROLES } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const RX_SELECT =
  "id, tenant_id, branch_id, patient_id, doctor_id, visit_id, diagnosis, notes, status, pharmacy_type, external_pharmacy_name, dispensed_at, dispensed_by, issued_date, expires_date, created_at, updated_at, patients(id, patient_number, first_name, last_name, user_id), users!prescriptions_doctor_id_fkey(id, full_name, role), prescription_items(id, drug_id, pharmacy_drug_id, medication_name, dosage, frequency, route, duration, quantity, refills, dispensed_qty, instructions)";

function resolveFamilyIds(data: Array<{ id: string; primary_account_id: string | null }>): string[] {
  const ids = new Set<string>();
  for (const row of data ?? []) {
    ids.add(row.id);
    if (row.primary_account_id) ids.add(row.primary_account_id);
  }
  return Array.from(ids);
}

// GET /api/prescriptions?patient_id=&status=&pharmacy_type=&page=&pageSize=
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const patientId = resolveParam(req.nextUrl.searchParams.get("patient_id"));
  const status = resolveParam(req.nextUrl.searchParams.get("status"));
  const pharmacyType = resolveParam(req.nextUrl.searchParams.get("pharmacy_type"));

  let familyIds: string[] | null = null;
  if (ctx.role === "patient_api") {
    const { data } = await ctx.svc
      .from("patients")
      .select("id, primary_account_id")
      .eq("user_id", ctx.user.id);
    familyIds = resolveFamilyIds(data ?? []);
    if (familyIds.length === 0) return okPaginated([], 0, page, pageSize);
  }

  let query = ctx.svc
    .from("prescriptions")
    .select(RX_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("issued_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (patientId) query = query.eq("patient_id", patientId);
  if (status) query = query.eq("status", status);
  if (pharmacyType) query = query.eq("pharmacy_type", pharmacyType);
  if (familyIds) query = query.in("patient_id", familyIds);

  const { data, count } = await query;
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export interface CreatePrescriptionItemBody {
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

export interface CreatePrescriptionBody {
  patientId: string;
  doctorId: string;
  diagnosis?: string;
  notes?: string;
  status?: string;
  pharmacyType?: "in_house" | "external";
  externalPharmacyName?: string;
  items: CreatePrescriptionItemBody[];
}

// POST /api/prescriptions
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as CreatePrescriptionBody;

  if (!body.patientId || !body.doctorId) {
    throw new ValidationError("Patient and doctor are required");
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ValidationError("At least one medication is required");
  }
  const pharmacyType = body.pharmacyType === "external" ? "external" : "in_house";

  const { data: patient } = await ctx.svc
    .from("patients")
    .select("id, first_name, last_name, user_id")
    .eq("id", body.patientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!patient) throw new NotFoundError("Patient not found");

  const { data: doctor } = await ctx.svc
    .from("users")
    .select("id, role, full_name")
    .eq("id", body.doctorId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (!doctor || !["hospital_admin", ...CLINICIAN_ROLES].includes(doctor.role)) {
    throw new ValidationError("Invalid doctor selected");
  }

  // Validate pharmacy catalog links when provided
  if (body.items.some((i) => i.pharmacyDrugId)) {
    const { data: matched } = await ctx.svc
      .from("pharmacy_drugs")
      .select("id")
      .in("id", body.items.map((i) => i.pharmacyDrugId).filter(Boolean) as string[]);
    const found = new Set((matched ?? []).map((d: { id: string }) => d.id));
    for (const item of body.items) {
      if (item.pharmacyDrugId && !found.has(item.pharmacyDrugId)) {
        throw new ValidationError(`Pharmacy drug not found: ${item.medicationName}`);
      }
    }
  }

  const { data: prescription, error } = await ctx.svc
    .from("prescriptions")
    .insert({
      tenant_id: tenantId,
      branch_id: ctx.branchId ?? null,
      patient_id: body.patientId,
      doctor_id: body.doctorId,
      diagnosis: body.diagnosis?.trim() || null,
      notes: body.notes?.trim() || null,
      status: body.status || "pending",
      pharmacy_type: pharmacyType,
      external_pharmacy_name: pharmacyType === "external" ? body.externalPharmacyName?.trim() || null : null,
      issued_date: new Date().toISOString().slice(0, 10),
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  const items = body.items.map((item) => ({
    prescription_id: prescription.id,
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
  const { data: createdItems, error: itemsError } = await ctx.svc
    .from("prescription_items")
    .insert(items)
    .select();
  if (itemsError) throw new ValidationError(itemsError.message);

  // Fan-out AFTER items exist: in-house -> pharmacists/hospital admins +
  // patient copy; external -> patient only (drug list + instructions).
  await ctx.svc.rpc("notify_prescription_event", {
    p_prescription_id: prescription.id,
    p_event: "created",
  });

  await logAudit(req, ctx, {
    action: "create",
    entityType: "prescriptions",
    entityId: prescription.id,
    description: `Prescription written for ${patient.first_name} ${patient.last_name} by ${doctor.full_name} (${body.items.length} item(s), ${pharmacyType} pharmacy)`,
  });

  return ok({ ...prescription, prescription_items: createdItems ?? [] }, 201);
});

export const runtime = "nodejs";
