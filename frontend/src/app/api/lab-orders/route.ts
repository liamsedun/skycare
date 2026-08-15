import { withAuth, withStaff, okPaginated, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { CLINICIAN_ROLES } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ORDER_SELECT =
  "id, tenant_id, branch_id, patient_id, doctor_id, visit_id, status, requested_at, completed_at, notes, created_by, created_at, updated_at, patients(id, patient_number, first_name, last_name, user_id), users!lab_orders_doctor_id_fkey(id, full_name, role), lab_order_tests(id, order_id, test_id, test_name, sample_type, priority, lab_results(id, result, unit, is_abnormal, uploaded_by, result_file_url, reported_at))";

// GET /api/lab-orders?patient_id=&status=&page=&pageSize=
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
    .from("lab_orders")
    .select(ORDER_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("requested_at", { ascending: false })
    .range(from, to);

  if (patientId) query = query.eq("patient_id", patientId);
  if (status) query = query.eq("status", status);
  if (familyIds) query = query.in("patient_id", familyIds);

  const { data, count } = await query;
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export interface CreateLabOrderBody {
  patientId: string;
  doctorId?: string;
  notes?: string;
  tests: Array<{ testId?: string; testName: string; sampleType?: string; priority?: string }>;
}

// POST /api/lab-orders
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as CreateLabOrderBody;

  if (!body.patientId || !Array.isArray(body.tests) || body.tests.length === 0) {
    throw new ValidationError("Patient and at least one test are required");
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
    if (!doctor || !["hospital_admin", "nurse", ...CLINICIAN_ROLES].includes(doctor.role)) {
      throw new ValidationError("Invalid doctor selected");
    }
  }

  const { data: order, error } = await ctx.svc
    .from("lab_orders")
    .insert({
      tenant_id: tenantId,
      branch_id: ctx.branchId ?? null,
      patient_id: body.patientId,
      doctor_id: body.doctorId || null,
      status: "requested",
      notes: body.notes?.trim() || null,
      created_by: ctx.user.id,
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  const tests = body.tests.map((t) => ({
    order_id: order.id,
    test_id: t.testId || null,
    test_name: t.testName.trim(),
    sample_type: t.sampleType?.trim() || null,
    priority: t.priority || "routine",
  }));
  const { data: createdTests, error: testsError } = await ctx.svc
    .from("lab_order_tests")
    .insert(tests)
    .select();
  if (testsError) throw new ValidationError(testsError.message);

  if (patient.user_id) {
    await notifyUsers(ctx.svc, {
      orgId: tenantId,
      userIds: [patient.user_id],
      type: "lab_result",
      title: "Lab tests ordered",
      message: `${body.tests.length} test(s) requested for ${patient.first_name} ${patient.last_name}`,
      referenceType: "lab_orders",
      referenceId: order.id,
    });
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "lab_orders",
    entityId: order.id,
    description: `Lab order (${body.tests.length} test(s)) for ${patient.first_name} ${patient.last_name}`,
  });

  return ok({ ...order, lab_order_tests: createdTests ?? [] }, 201);
});

export const runtime = "nodejs";
