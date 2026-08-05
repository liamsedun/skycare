import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit, logView } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ORDER_SELECT =
  "id, tenant_id, branch_id, patient_id, doctor_id, visit_id, status, requested_at, completed_at, notes, created_by, created_at, updated_at, patients(id, patient_number, first_name, last_name, user_id), users!lab_orders_doctor_id_fkey(id, full_name, role), lab_order_tests(id, order_id, test_id, test_name, sample_type, priority, lab_results(id, result, unit, is_abnormal, uploaded_by, result_file_url, reported_at))";

async function getOrder(ctx: any, id: string, tenantId: string) {
  const { data } = await ctx.svc
    .from("lab_orders")
    .select(ORDER_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

// GET /api/lab-orders/[id]
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const order = await getOrder(ctx, id, tenantId);
  if (!order) throw new NotFoundError("Lab order not found");
  await logView(req, ctx, "lab_orders", id, `Viewed lab order for patient`);
  return ok(order);
});

// PUT /api/lab-orders/[id] — status transitions + result entry
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getOrder(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Lab order not found");

  const body = (await req.json()) as {
    status?: string;
    notes?: string;
    results?: Array<{
      orderTestId: string;
      result?: string;
      unit?: string;
      isAbnormal?: boolean;
      resultFileUrl?: string;
    }>;
  };

  const patch: Record<string, unknown> = {};
  if (body.status) {
    if (!["requested", "sample_collected", "in_progress", "completed", "cancelled"].includes(body.status)) {
      throw new ValidationError("Invalid lab order status");
    }
    patch.status = body.status;
    if (body.status === "completed") patch.completed_at = new Date().toISOString();
  }
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;

  // Enter results per test
  if (Array.isArray(body.results)) {
    const orderTestIds = new Set((existing.lab_order_tests ?? []).map((t: { id: string }) => t.id));
    for (const res of body.results) {
      if (!orderTestIds.has(res.orderTestId)) {
        throw new ValidationError("Test does not belong to this order");
      }
      const { data: existingResult } = await ctx.svc
        .from("lab_results")
        .select("id")
        .eq("order_test_id", res.orderTestId)
        .maybeSingle();
      const row = {
        result: res.result?.trim() || null,
        unit: res.unit?.trim() || null,
        is_abnormal: res.isAbnormal === true,
        uploaded_by: ctx.user.id,
        result_file_url: res.resultFileUrl?.trim() || null,
        reported_at: new Date().toISOString(),
      };
      if (existingResult) {
        const { error } = await ctx.svc
          .from("lab_results")
          .update(row)
          .eq("id", existingResult.id);
        if (error) throw new ValidationError(error.message);
      } else {
        const { error } = await ctx.svc
          .from("lab_results")
          .insert({ order_test_id: res.orderTestId, ...row });
        if (error) throw new ValidationError(error.message);
      }
    }
    patch.status = "completed";
    patch.completed_at = new Date().toISOString();
  }

  const { data: updated, error } = await ctx.svc
    .from("lab_orders")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select(ORDER_SELECT)
    .single();
  if (error) throw new ValidationError(error.message);

  // Notify the patient when results are ready
  if (patch.status === "completed" && existing.patients?.user_id) {
    await notifyUsers(ctx.svc, {
      orgId: tenantId,
      userIds: [existing.patients.user_id],
      type: "lab_result",
      title: "Lab results ready",
      message: `Results are available for your lab order`,
      referenceType: "lab_orders",
      referenceId: id,
    });
  }

  await logAudit(req, ctx, {
    action: "update",
    entityType: "lab_orders",
    entityId: id,
    description:
      patch.status === "completed"
        ? "Lab order completed with results"
        : `Lab order status set to ${patch.status ?? "updated"}`,
  });

  return ok(updated);
});

export const runtime = "nodejs";
