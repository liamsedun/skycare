import { withStaff, ok, okPaginated, ValidationError, requireTenant, getPagination, resolveParam } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ENCOUNTER_SELECT =
  "id, patient_id, provider_id, policy_id, appointment_id, encounter_type, encounter_date, doctor_id, diagnosis_code, diagnosis_desc, total_billed, total_covered, total_co_pay, claim_id, status, created_at, updated_at, patients!hmo_encounters_patient_id_fkey(id, first_name, last_name, patient_number), insurance_providers!hmo_encounters_provider_id_fkey(id, name)";

// GET /api/insurance/encounters?patient_id=&encounter_type=&status=&from=&to=&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const patientId = resolveParam(req.nextUrl.searchParams.get("patient_id"));
  const encounterType = resolveParam(req.nextUrl.searchParams.get("encounter_type"));
  const status = resolveParam(req.nextUrl.searchParams.get("status"));
  const dateFrom = resolveParam(req.nextUrl.searchParams.get("from"));
  const dateTo = resolveParam(req.nextUrl.searchParams.get("to"));

  let query = ctx.svc
    .from("hmo_encounters")
    .select(ENCOUNTER_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("encounter_date", { ascending: false })
    .range(from, to);

  if (patientId) query = query.eq("patient_id", patientId);
  if (encounterType) query = query.eq("encounter_type", encounterType);
  if (status) query = query.eq("status", status);
  if (dateFrom) query = query.gte("encounter_date", dateFrom);
  if (dateTo) query = query.lte("encounter_date", dateTo);

  const { data, count, error } = await query;
  if (error) throw new ValidationError(error.message);
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

interface EncounterBody {
  patientId: string;
  providerId?: string | null;
  policyId?: string | null;
  appointmentId?: string | null;
  encounterType: string;
  encounterDate?: string;
  doctorId?: string | null;
  diagnosisCode?: string | null;
  diagnosisDesc?: string | null;
}

const VALID_ENCOUNTER_TYPES = ["outpatient", "inpatient", "emergency", "pharmacy", "lab", "maternity", "other"];

function validateEncounterBody(body: any): EncounterBody {
  if (!body?.patientId?.trim()) throw new ValidationError("Patient ID is required");
  if (!body?.encounterType?.trim()) throw new ValidationError("Encounter type is required");
  if (!VALID_ENCOUNTER_TYPES.includes(body.encounterType.trim())) {
    throw new ValidationError(`Encounter type must be one of: ${VALID_ENCOUNTER_TYPES.join(", ")}`);
  }
  return {
    patientId: body.patientId.trim(),
    providerId: body.providerId?.trim() || null,
    policyId: body.policyId?.trim() || null,
    appointmentId: body.appointmentId?.trim() || null,
    encounterType: body.encounterType.trim(),
    encounterDate: body.encounterDate?.trim() || new Date().toISOString().slice(0, 10),
    doctorId: body.doctorId?.trim() || null,
    diagnosisCode: body.diagnosisCode?.trim() || null,
    diagnosisDesc: body.diagnosisDesc?.trim() || null,
  };
}

// POST /api/insurance/encounters
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = validateEncounterBody(await req.json());

  // Auto-lookup active policy if patient is insured
  let providerId = body.providerId;
  let policyId = body.policyId;
  let totalBilled = 0;
  let totalCovered = 0;
  let totalCoPay = 0;

  if (!policyId) {
    const { data: policy } = await ctx.svc
      .from("insurance_policies")
      .select("id, provider_id, coverage_type, co_pay_percent, co_pay_amount")
      .eq("tenant_id", tenantId)
      .eq("patient_id", body.patientId)
      .eq("status", "active")
      .eq("is_primary", true)
      .maybeSingle();
    if (policy) {
      policyId = policy.id;
      providerId = providerId ?? policy.provider_id;
    }
  }

  // Look up coverage rules to compute totals
  if (policyId && providerId) {
    const { data: coverage } = await ctx.svc
      .from("insurance_coverage_rules")
      .select("coverage_percent, co_pay_amount")
      .eq("tenant_id", tenantId)
      .eq("provider_id", providerId)
      .eq("service_type", body.encounterType)
      .eq("is_active", true)
      .is("service_id", null)
      .maybeSingle();
    if (coverage) {
      const pct = Number(coverage.coverage_percent ?? 0) / 100;
      totalCovered = totalBilled * pct;
      totalCoPay = Number(coverage.co_pay_amount ?? 0);
    }
  }

  const { data, error } = await ctx.svc
    .from("hmo_encounters")
    .insert({
      tenant_id: tenantId,
      patient_id: body.patientId,
      provider_id: providerId,
      policy_id: policyId,
      appointment_id: body.appointmentId,
      encounter_type: body.encounterType,
      encounter_date: body.encounterDate,
      doctor_id: body.doctorId,
      diagnosis_code: body.diagnosisCode,
      diagnosis_desc: body.diagnosisDesc,
      total_billed: totalBilled,
      total_covered: totalCovered,
      total_co_pay: totalCoPay,
      status: "open",
    })
    .select(ENCOUNTER_SELECT)
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "hmo_encounters",
    entityId: data.id,
    description: `Created encounter: ${body.encounterType} for patient ${body.patientId}`,
  });

  return ok(data, 201);
});

export const runtime = "nodejs";
