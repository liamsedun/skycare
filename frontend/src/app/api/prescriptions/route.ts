import { withAuth, withStaff, okPaginated, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const RX_SELECT =
  "id, tenant_id, branch_id, patient_id, doctor_id, visit_id, diagnosis, notes, status, issued_date, expires_date, created_at, updated_at, patients(id, patient_number, first_name, last_name, user_id), users(id, full_name, role), prescription_items(id, drug_id, medication_name, dosage, frequency, route, duration, quantity, refills, dispensed_qty, instructions)";

function resolveFamilyIds(data: Array<{ id: string; primary_account_id: string | null }>): string[] {
  const ids = new Set<string>();
  for (const row of data ?? []) {
    ids.add(row.id);
    if (row.primary_account_id) ids.add(row.primary_account_id);
  }
  return Array.from(ids);
}

// GET /api/prescriptions?patient_id=&status=&page=&pageSize=
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const patientId = resolveParam(req.nextUrl.searchParams.get("patient_id"));
  const status = resolveParam(req.nextUrl.searchParams.get("status"));

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
  if (familyIds) query = query.in("patient_id", familyIds);

  const { data, count } = await query;
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export interface CreatePrescriptionItemBody {
  medicationName: string;
  drugId?: string;
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
  if (!doctor || !["doctor", "hospital_admin"].includes(doctor.role)) {
    throw new ValidationError("Invalid doctor selected");
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
      status: body.status || "active",
      issued_date: new Date().toISOString().slice(0, 10),
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  const items = body.items.map((item) => ({
    prescription_id: prescription.id,
    drug_id: item.drugId || null,
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

  if (patient.user_id) {
    await notifyUsers(ctx.svc, {
      orgId: tenantId,
      userIds: [patient.user_id],
      type: "prescription_refill",
      title: "New prescription",
      message: `${body.items.length} medication(s) prescribed by ${doctor.full_name}`,
      referenceType: "prescriptions",
      referenceId: prescription.id,
    });
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "prescriptions",
    entityId: prescription.id,
    description: `Prescription written for ${patient.first_name} ${patient.last_name} by ${doctor.full_name} (${body.items.length} item(s))`,
  });

  return ok({ ...prescription, prescription_items: createdItems ?? [] }, 201);
});

export const runtime = "nodejs";
