import {
  withAuth,
  ok,
  okPaginated,
  ValidationError,
  ForbiddenError,
  requireTenant,
  getPagination,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const READ_ROLES = ["hospital_admin", "super_admin", "doctor", "nurse"];
const WRITE_ROLES = ["hospital_admin", "super_admin", "doctor", "nurse"];

const NOTE_SELECT =
  "id, tenant_id, patient_id, doctor_id, appointment_id, visit_date, vitals, tests_procedures, clinical_findings, diagnosis, medications, treatment_recommendations, next_visit_date, next_visit_reason, is_confidential, created_by, created_at, updated_at, patients(id, patient_number, first_name, last_name, gender, date_of_birth), users!doctor_notes_doctor_id_fkey(id, full_name, role)";

async function familyPatientIds(ctx: any): Promise<string[]> {
  const { data: me } = await ctx.svc
    .from("patients")
    .select("id, primary_account_id")
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (!me) return [];
  const ids = new Set<string>();
  ids.add(me.id);
  if (me.primary_account_id) ids.add(me.primary_account_id);
  const { data: deps } = await ctx.svc
    .from("patients")
    .select("id")
    .eq("primary_account_id", me.id);
  for (const d of deps ?? []) ids.add(d.id);
  return Array.from(ids);
}

// GET /api/doctor-notes?patient_id=&page=&pageSize=
// Staff (clinical) read any patient in the tenant; patient_api reads their own family's non-confidential notes.
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const patientIdParam = req.nextUrl.searchParams.get("patient_id");

  let query = ctx.svc
    .from("doctor_notes")
    .select(NOTE_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("visit_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (ctx.role === "patient_api") {
    const ids = await familyPatientIds(ctx);
    if (ids.length === 0) throw new ForbiddenError("No patient record linked to your account");
    if (patientIdParam) {
      if (!ids.includes(patientIdParam)) throw new ForbiddenError("You can only view your family's notes");
      query = query.eq("patient_id", patientIdParam);
    } else {
      query = query.in("patient_id", ids);
    }
    query = query.eq("is_confidential", false);
  } else {
    if (!READ_ROLES.includes(ctx.role)) throw new ForbiddenError("Only clinical staff can view doctor notes");
    if (!patientIdParam) throw new ValidationError("patient_id is required");
    query = query.eq("patient_id", patientIdParam);
  }

  const { data, count, error } = await query;
  if (error) throw new ValidationError(error.message);
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

interface CreateNoteBody {
  patientId: string;
  appointmentId?: string;
  visitDate?: string;
  vitals?: Record<string, string | number>;
  testsProcedures?: Record<string, string | number>;
  clinicalFindings?: string;
  diagnosis?: Record<string, string>;
  medications?: Array<Record<string, string | number>>;
  treatmentRecommendations?: string;
  nextVisitDate?: string;
  nextVisitReason?: string;
  isConfidential?: boolean;
}

// POST /api/doctor-notes — clinical staff write notes
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!WRITE_ROLES.includes(ctx.role)) {
    throw new ForbiddenError("Only clinical staff can write doctor notes");
  }

  const body = (await req.json()) as CreateNoteBody;
  if (!body.patientId) throw new ValidationError("patient_id is required");

  const { data: patient } = await ctx.svc
    .from("patients")
    .select("id, tenant_id")
    .eq("id", body.patientId)
    .maybeSingle();
  if (!patient || patient.tenant_id !== tenantId) {
    throw new ValidationError("Patient not found in your hospital");
  }

  const { data, error } = await ctx.svc
    .from("doctor_notes")
    .insert({
      tenant_id: tenantId,
      patient_id: body.patientId,
      appointment_id: body.appointmentId ?? null,
      visit_date: body.visitDate || new Date().toISOString().slice(0, 10),
      vitals: body.vitals ?? {},
      tests_procedures: body.testsProcedures ?? {},
      clinical_findings: body.clinicalFindings?.trim() || null,
      diagnosis: body.diagnosis ?? {},
      medications: body.medications ?? [],
      treatment_recommendations: body.treatmentRecommendations?.trim() || null,
      next_visit_date: body.nextVisitDate || null,
      next_visit_reason: body.nextVisitReason?.trim() || null,
      is_confidential: body.isConfidential ?? true,
      doctor_id: ctx.user.id,
      created_by: ctx.user.id,
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "doctor_notes",
    entityId: data.id,
    description: `Wrote doctor note for patient ${body.patientId}`,
  });

  return ok(data, 201);
});

export const runtime = "nodejs";