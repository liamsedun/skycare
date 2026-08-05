import { withAuth, withStaff, okPaginated, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { logView } from "@/lib/audit";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const MR_SELECT =
  "id, tenant_id, patient_id, visit_id, created_by, record_type, title, content, attachments, is_confidential, created_at, updated_at, patients(id, patient_number, first_name, last_name), users(id, full_name, role)";

export const RECORD_TYPES = [
  "diagnosis",
  "lab_result",
  "prescription",
  "surgery_report",
  "vaccination",
  "imaging",
  "progress_note",
  "admission_summary",
  "discharge_summary",
] as const;

// GET /api/medical-records?patient_id=&record_type=&page=&pageSize=
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const patientId = resolveParam(req.nextUrl.searchParams.get("patient_id"));
  const recordType = resolveParam(req.nextUrl.searchParams.get("record_type"));

  let familyIds: string[] | null = null;
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
    familyIds = Array.from(ids);
    if (familyIds.length === 0) return okPaginated([], 0, page, pageSize);
  }

  let query = ctx.svc
    .from("medical_records")
    .select(MR_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (patientId) query = query.eq("patient_id", patientId);
  if (recordType) query = query.eq("record_type", recordType);
  if (familyIds) query = query.in("patient_id", familyIds);

  const { data, count } = await query;

  if (patientId) {
    const { data: patient } = await ctx.svc
      .from("patients")
      .select("first_name, last_name")
      .eq("id", patientId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (patient) {
      await logView(req, ctx, "medical_records", patientId, `Listed ${count ?? 0} medical record(s) for ${patient.first_name} ${patient.last_name}`);
    }
  }

  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export interface CreateMedicalRecordBody {
  patientId: string;
  recordType: string;
  title: string;
  content?: string;
  isConfidential?: boolean;
}

// POST /api/medical-records
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as CreateMedicalRecordBody;

  if (!body.patientId || !body.title?.trim()) {
    throw new ValidationError("Patient and title are required");
  }
  if (!RECORD_TYPES.includes(body.recordType as (typeof RECORD_TYPES)[number])) {
    throw new ValidationError("Invalid record type");
  }

  const { data: patient } = await ctx.svc
    .from("patients")
    .select("id, first_name, last_name")
    .eq("id", body.patientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!patient) throw new ValidationError("Patient not found in this hospital");

  const { data: record, error } = await ctx.svc
    .from("medical_records")
    .insert({
      tenant_id: tenantId,
      patient_id: body.patientId,
      created_by: ctx.user.id,
      record_type: body.recordType,
      title: body.title.trim(),
      content: body.content?.trim() || null,
      is_confidential: body.isConfidential === true,
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "medical_records",
    entityId: record.id,
    description: `Added ${body.recordType} record "${body.title}" for ${patient.first_name} ${patient.last_name}`,
  });

  return ok(record, 201);
});

export const runtime = "nodejs";
