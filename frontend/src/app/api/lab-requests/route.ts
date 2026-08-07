import { withAuth, withStaff, okPaginated, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { CLINICIAN_ROLES } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const REQUEST_SELECT =
  "id, tenant_id, branch_id, patient_id, doctor_id, status, is_external, external_lab_id, requested_at, completed_at, notes, created_by, created_at, updated_at, patients(id, patient_number, first_name, last_name, user_id), users!lab_requests_doctor_id_fkey(id, full_name, role), lab_request_items(id, service_id, service_name, priority, sample_type, notes)";

// GET /api/lab-requests?patient_id=&status=&page=&pageSize=
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
    const ids = new Set<string>();
    for (const row of data ?? []) {
      ids.add(row.id);
      if (row.primary_account_id) ids.add(row.primary_account_id);
    }
    familyIds = Array.from(ids);
    if (familyIds.length === 0) return okPaginated([], 0, page, pageSize);
  }

  let query = ctx.svc
    .from("lab_requests")
    .select(REQUEST_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("requested_at", { ascending: false })
    .range(from, to);

  if (patientId) query = query.eq("patient_id", patientId);
  if (status) query = query.eq("status", status);
  if (familyIds) query = query.in("patient_id", familyIds);

  const { data, count } = await query;
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export interface CreateLabRequestBody {
  patientId: string;
  doctorId?: string;
  isExternal?: boolean;
  externalLabId?: string;
  notes?: string;
  items: Array<{
    serviceId?: string;
    serviceName?: string;
    priority?: string;
    sampleType?: string;
    notes?: string;
  }>;
}

// POST /api/lab-requests — in-house or external-lab request with line items
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as CreateLabRequestBody;

  if (!body.patientId || !Array.isArray(body.items) || body.items.length === 0) {
    throw new ValidationError("Patient and at least one service are required");
  }

  const { data: patient } = await ctx.svc
    .from("patients")
    .select("id, first_name, last_name, user_id")
    .eq("id", body.patientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!patient) throw new NotFoundError("Patient not found");

  if (body.doctorId) {
    const { data: doctor } = await ctx.svc
      .from("users")
      .select("id, role")
      .eq("id", body.doctorId)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();
    if (!doctor || !["hospital_admin", ...CLINICIAN_ROLES].includes(doctor.role)) {
      throw new ValidationError("Invalid doctor selected");
    }
  }

  const items: Array<{
    service_id: string | null;
    service_name: string;
    priority: string;
    sample_type: string | null;
    notes: string | null;
  }> = [];
  let missing = 0;

  for (const item of body.items) {
    const name = item.serviceName?.trim();
    if (item.serviceId) {
      const { data: svc } = await ctx.svc
        .from("lab_services")
        .select("id, name, approval_status, is_active")
        .eq("id", item.serviceId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!svc) {
        missing++;
        continue;
      }
      if (svc.approval_status !== "approved" || !svc.is_active) {
        throw new ValidationError(`Service "${svc.name}" is not available for ordering`);
      }
      items.push({
        service_id: svc.id,
        service_name: svc.name,
        priority: item.priority || "routine",
        sample_type: item.sampleType?.trim() || null,
        notes: item.notes?.trim() || null,
      });
    } else {
      if (!name) {
        missing++;
        continue;
      }
      items.push({
        service_id: null,
        service_name: name,
        priority: item.priority || "routine",
        sample_type: item.sampleType?.trim() || null,
        notes: item.notes?.trim() || null,
      });
    }
  }
  if (missing > 0) throw new ValidationError("One or more selected services no longer exist");
  if (items.length === 0) throw new ValidationError("At least one valid service is required");

  const { data: request, error } = await ctx.svc
    .from("lab_requests")
    .insert({
      tenant_id: tenantId,
      branch_id: ctx.branchId ?? null,
      patient_id: body.patientId,
      doctor_id: body.doctorId || null,
      status: "requested",
      is_external: !!body.isExternal,
      external_lab_id: body.externalLabId?.trim() || null,
      notes: body.notes?.trim() || null,
      created_by: ctx.user.id,
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  const { data: createdItems, error: itemsError } = await ctx.svc
    .from("lab_request_items")
    .insert(items.map((i) => ({ request_id: request.id, ...i })))
    .select();
  if (itemsError) throw new ValidationError(itemsError.message);

  if (patient.user_id) {
    await notifyUsers(ctx.svc, {
      orgId: tenantId,
      userIds: [patient.user_id],
      type: "lab_result",
      title: "Lab tests ordered",
      message: `${items.length} service(s) requested for ${patient.first_name} ${patient.last_name}`,
      referenceType: "lab_requests",
      referenceId: request.id,
    });
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "lab_requests",
    entityId: request.id,
    description: `Lab request (${items.length} item(s)) for ${patient.first_name} ${patient.last_name}${body.isExternal ? " — external lab" : ""}`,
  });

  return ok({ ...request, lab_request_items: createdItems ?? [] }, 201);
});

export const runtime = "nodejs";
