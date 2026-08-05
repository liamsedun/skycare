import {
  withAuth,
  ok,
  ValidationError,
  ForbiddenError,
  NotFoundError,
  requireTenant,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const CLINICAL_ROLES = ["hospital_admin", "super_admin", "doctor", "nurse"];

const NOTE_SELECT =
  "id, tenant_id, patient_id, doctor_id, appointment_id, visit_date, vitals, tests_procedures, clinical_findings, diagnosis, medications, treatment_recommendations, next_visit_date, next_visit_reason, is_confidential, created_by, created_at, updated_at, patients(id, patient_number, first_name, last_name, gender, date_of_birth), users!doctor_notes_doctor_id_fkey(id, full_name, role)";

function idFrom(req: NextRequest): string {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  return segs[segs.length - 1];
}

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

// GET /api/doctor-notes/[id] — clinical staff: any note in tenant; patient_api: own family + non-confidential
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = idFrom(req);

  const { data: note, error } = await ctx.svc
    .from("doctor_notes")
    .select(NOTE_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new ValidationError(error.message);
  if (!note) throw new NotFoundError("Doctor note not found");

  if (ctx.role === "patient_api") {
    if (note.is_confidential) throw new NotFoundError("Doctor note not found");
    const ids = await familyPatientIds(ctx);
    if (!ids.includes(note.patient_id)) throw new NotFoundError("Doctor note not found");
  } else if (!CLINICAL_ROLES.includes(ctx.role)) {
    throw new ForbiddenError("Only clinical staff can view doctor notes");
  }

  return ok(note);
});

// PUT /api/doctor-notes/[id] — clinical staff update; patient_api may update their own family's non-confidential note content
export const PUT = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = idFrom(req);
  const body = await req.json();

  const { data: existing, error: getErr } = await ctx.svc
    .from("doctor_notes")
    .select("id, patient_id, is_confidential")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (getErr || !existing) throw new NotFoundError("Doctor note not found");

  const isPatient = ctx.role === "patient_api";
  if (isPatient) {
    if (existing.is_confidential) throw new NotFoundError("Doctor note not found");
    const ids = await familyPatientIds(ctx);
    if (!ids.includes(existing.patient_id)) throw new NotFoundError("Doctor note not found");
  } else if (!CLINICAL_ROLES.includes(ctx.role)) {
    throw new ForbiddenError("Only clinical staff can edit doctor notes");
  }

  const patch: Record<string, any> = {};
  if (body.appointmentId !== undefined) {
    if (isPatient) throw new ValidationError("Patients can only update note content");
    patch.appointment_id = body.appointmentId || null;
  }
  if (body.visitDate !== undefined) {
    if (isPatient) throw new ValidationError("Patients can only update note content");
    patch.visit_date = body.visitDate || new Date().toISOString().slice(0, 10);
  }
  if (body.vitals !== undefined) patch.vitals = body.vitals ?? {};
  if (body.testsProcedures !== undefined) patch.tests_procedures = body.testsProcedures ?? {};
  if (body.clinicalFindings !== undefined) patch.clinical_findings = body.clinicalFindings?.trim() || null;
  if (body.diagnosis !== undefined) patch.diagnosis = body.diagnosis ?? {};
  if (body.medications !== undefined) patch.medications = body.medications ?? [];
  if (body.treatmentRecommendations !== undefined) patch.treatment_recommendations = body.treatmentRecommendations?.trim() || null;
  if (body.nextVisitDate !== undefined) patch.next_visit_date = body.nextVisitDate || null;
  if (body.nextVisitReason !== undefined) patch.next_visit_reason = body.nextVisitReason?.trim() || null;
  if (body.isConfidential !== undefined) {
    if (isPatient) throw new ValidationError("Patients cannot change confidentiality");
    patch.is_confidential = !!body.isConfidential;
  }

  if (Object.keys(patch).length === 0) throw new ValidationError("No fields to update");

  const { data, error } = await ctx.svc.from("doctor_notes").update(patch).eq("id", id).select(NOTE_SELECT).single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "doctor_notes",
    entityId: id,
    description: `Updated doctor note for patient ${existing.patient_id}`,
  });

  return ok(data);
});

// DELETE /api/doctor-notes/[id] — clinical staff delete
export const DELETE = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!CLINICAL_ROLES.includes(ctx.role)) {
    throw new ForbiddenError("Only clinical staff can delete doctor notes");
  }
  const id = idFrom(req);

  const { data: existing, error: getErr } = await ctx.svc
    .from("doctor_notes")
    .select("id, patient_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (getErr || !existing) throw new NotFoundError("Doctor note not found");

  const { error } = await ctx.svc.from("doctor_notes").delete().eq("id", id);
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "doctor_notes",
    entityId: id,
    description: `Deleted doctor note for patient ${existing.patient_id}`,
  });

  return ok({ ok: true });
});

export const runtime = "nodejs";