import { withAuth, withStaff, okPaginated, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { pushNotifyUsers } from "@/lib/push-send";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const REQUEST_SELECT =
  "id, tenant_id, branch_id, patient_id, doctor_id, status, is_external, external_lab_id, invoice_id, payment_id, referrer, requested_at, completed_at, notes, created_by, created_at, updated_at, patients(id, patient_number, first_name, last_name, user_id, is_walk_in), users!lab_requests_doctor_id_fkey(id, full_name, role), lab_request_items(id, service_id, service_name, priority, sample_type, notes, result, result_unit, is_abnormal, reported_at), lab_request_assignments(user_id, users(id, full_name, role)), invoices!fk_lab_requests_invoice(id, invoice_number, status, total_amount), payments!fk_lab_requests_payment(id, reference, payment_method, amount, status, paid_at)";

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
  assignedToIds?: string[];
  items: Array<{
    serviceId?: string;
    serviceName?: string;
    priority?: string;
    sampleType?: string;
    notes?: string;
  }>;
}

// POST /api/lab-requests — in-house or external-lab request with line items.
// The insert itself runs in a single transaction via the create_lab_request
// RPC (validates tenant-anchored patient/doctor/services, inserts request +
// items). Messaging is fired by the deferred AFTER INSERT trigger at COMMIT
// (in-house: lab staff + patient + main patient for dependants; external:
// patient/main only). Here we read back the trigger's notification rows to
// know who to web-push.
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

  const { data: created, error: rpcError } = await ctx.svc.rpc("create_lab_request", {
    p_patient_id: body.patientId,
    p_services: body.items.map((i) => ({
      serviceId: i.serviceId ?? null,
      serviceName: i.serviceName ?? null,
      priority: i.priority || "routine",
      sampleType: i.sampleType?.trim() || null,
      notes: i.notes?.trim() || null,
    })),
    p_is_external: !!body.isExternal,
    p_external_lab_id: body.externalLabId?.trim() || null,
    p_doctor_id: body.doctorId || null,
    p_branch_id: ctx.branchId ?? null,
    p_notes: body.notes?.trim() || null,
    p_created_by: ctx.user.id,
    p_assigned_user_ids: body.isExternal ? null : (body.assignedToIds?.length ? body.assignedToIds : null),
  });
  if (rpcError) throw new ValidationError(rpcError.message);

  const request = created as {
    id: string;
    lab_request_items?: Array<{ service_name: string }>;
  };

  // The trigger already wrote in-app notifications at COMMIT — read them back
  // to web-push the same recipients.
  const { data: notifRows } = await ctx.svc
    .from("notifications")
    .select("user_id")
    .eq("reference_type", "lab_requests")
    .eq("reference_id", request.id);
  const notified = Array.from(
    new Set(
      (notifRows ?? [])
        .map((r) => r.user_id as string | null)
        .filter((u): u is string => Boolean(u))
    )
  );
  if (notified.length > 0) {
    await pushNotifyUsers(ctx.svc, {
      userIds: notified,
      type: "lab_result",
      title: "Lab tests ordered",
      body: `${request.lab_request_items?.length ?? body.items.length} service(s) requested for ${patient.first_name} ${patient.last_name}`,
      referenceType: "lab_requests",
      referenceId: request.id,
    });
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "lab_requests",
    entityId: request.id,
    description: `Lab request (${request.lab_request_items?.length ?? body.items.length} item(s)) for ${patient.first_name} ${patient.last_name}${body.isExternal ? " — external lab" : ""}`,
  });

  return ok(request, 201);
});

export const runtime = "nodejs";
