import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/lab-requests/[id]/report — the assigned lab staff fill in the
// results of the testing and send them back:
//   1. persists per-service results on lab_request_items
//   2. marks the request completed (completed_at / completed_by)
//   3. mirrors the results into the patient-portal lab_orders/lab_results
//      tables so the patient's "Lab results" page shows them
//   4. sends an internal mail to the requesting staff (doctor/created_by)
//      with the patient in copy
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const routeSegments = req.nextUrl.pathname.split("/");
  const requestId = routeSegments[routeSegments.length - 2];

  const { data: labRequest, error: reqError } = await ctx.svc
    .from("lab_requests")
    .select(
      "id, tenant_id, branch_id, patient_id, doctor_id, status, is_external, notes, requested_at, created_by, patients(id, patient_number, first_name, last_name, user_id, primary_account_id), lab_request_items(id, service_id, service_name)"
    )
    .eq("id", requestId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (reqError || !labRequest) throw new NotFoundError("Lab request not found");
  if (labRequest.status === "completed" || labRequest.status === "cancelled") {
    throw new ValidationError(`Cannot report results for a ${labRequest.status} request`);
  }

  const body = (await req.json()) as {
    results: Array<{ itemId: string; result: string; unit?: string; isAbnormal?: boolean }>;
  };
  if (!Array.isArray(body.results) || body.results.length === 0) {
    throw new ValidationError("At least one result is required");
  }

  const items = labRequest.lab_request_items ?? [];
  const resultById = new Map(body.results.map((r) => [r.itemId, r]));
  const missing = items.filter((it: { id: string }) => !resultById.get(it.id)?.result?.trim());
  if (missing.length > 0) {
    throw new ValidationError(`Missing results for: ${missing.map((m: { service_name: string }) => m.service_name).join(", ")}`);
  }

  const now = new Date().toISOString();

  // 1. Persist per-service results.
  const updates = items.map((it: { id: string }) => {
    const r = resultById.get(it.id)!;
    return {
      result: r.result.trim(),
      result_unit: r.unit?.trim() || null,
      is_abnormal: !!r.isAbnormal,
      reported_at: now,
    };
  });
  for (let i = 0; i < items.length; i++) {
    const { error } = await ctx.svc
      .from("lab_request_items")
      .update(updates[i])
      .eq("id", items[i].id);
    if (error) throw new ValidationError(error.message);
  }

  // 2. Mark completed.
  const { error: completeError } = await ctx.svc
    .from("lab_requests")
    .update({ status: "completed", completed_at: now, completed_by: ctx.user.id })
    .eq("id", requestId)
    .eq("tenant_id", tenantId);
  if (completeError) throw new ValidationError(completeError.message);

  // 3. Mirror into the patient-portal lab_orders system.
  const patient = (labRequest.patients ?? null) as unknown as {
    id: string;
    first_name: string;
    last_name: string;
    user_id: string | null;
    primary_account_id: string | null;
  } | null;
  if (patient) {
    const { data: order, error: orderError } = await ctx.svc
      .from("lab_orders")
      .insert({
        tenant_id: tenantId,
        branch_id: labRequest.branch_id ?? null,
        patient_id: patient.id,
        doctor_id: labRequest.doctor_id ?? null,
        status: "completed",
        requested_at: labRequest.requested_at,
        completed_at: now,
        notes: labRequest.notes ?? null,
        created_by: ctx.user.id,
        lab_request_id: requestId,
      })
      .select()
      .single();
    if (orderError) throw new ValidationError(orderError.message);

    for (const it of items as Array<{ id: string; service_name: string; service_id: string | null }>) {
      const { data: orderTest } = await ctx.svc
        .from("lab_order_tests")
        .insert({
          order_id: order.id,
          test_id: it.service_id ?? null,
          test_name: it.service_name,
        })
        .select()
        .single();
      if (!orderTest) continue;
      const r = resultById.get(it.id)!;
      await ctx.svc.from("lab_results").insert({
        order_test_id: orderTest.id,
        result: r.result.trim(),
        unit: r.unit?.trim() || null,
        is_abnormal: !!r.isAbnormal,
        uploaded_by: ctx.user.id,
        reported_at: now,
      });
    }
  }

  // 4. Internal mail — requesting staff + patient in copy.
  const requesterIds = [labRequest.created_by, labRequest.doctor_id].filter(
    (id): id is string => Boolean(id)
  );
  const recipientIds = new Set<string>(requesterIds);
  if (patient?.user_id) recipientIds.add(patient.user_id);
  if (patient?.primary_account_id) {
    const { data: main } = await ctx.svc
      .from("patients")
      .select("user_id")
      .eq("id", patient.primary_account_id)
      .maybeSingle();
    if (main?.user_id) recipientIds.add(main.user_id);
  }
  recipientIds.delete(ctx.user.id);
  const finalRecipients = Array.from(recipientIds);

  const resultsLines = items.map((it: { id: string; service_name: string }) => {
    const r = resultById.get(it.id)!;
    const unit = r.unit?.trim() ? ` ${r.unit.trim()}` : "";
    const flag = r.isAbnormal ? " (ABNORMAL)" : "";
    return `• ${it.service_name}: ${r.result.trim()}${unit}${flag}`;
  });

  const { data: reporter } = await ctx.svc
    .from("users")
    .select("full_name")
    .eq("id", ctx.user.id)
    .maybeSingle();
  const reporterName = reporter?.full_name ?? "lab staff";

  const subject = `Lab results — ${patient ? `${patient.first_name} ${patient.last_name}` : "Patient"}`;
  const mailBody = [
    `Lab results for ${patient ? `${patient.first_name} ${patient.last_name}` : "the patient"}:`,
    "",
    ...resultsLines,
    "",
    `Reported by ${reporterName} on ${new Date(now).toLocaleString()}.`,
    "This is a system-generated message from the Laboratory module.",
  ].join("\n");

  if (finalRecipients.length > 0) {
    const { data: msg, error: msgError } = await ctx.svc
      .from("internal_messages")
      .insert({
        tenant_id: tenantId,
        sender_id: ctx.user.id,
        subject,
        body: mailBody,
        is_broadcast: false,
        broadcast_scope: "staff",
      })
      .select()
      .single();
    if (msgError) throw new ValidationError(msgError.message);

    const { error: recError } = await ctx.svc.from("internal_message_recipients").insert(
      finalRecipients.map((recipientId) => ({ message_id: msg.id, recipient_id: recipientId }))
    );
    if (recError) throw new ValidationError(recError.message);

    await notifyUsers(ctx.svc, {
      orgId: tenantId,
      userIds: finalRecipients,
      type: "lab_result",
      title: `Lab results ready — ${patient ? `${patient.first_name} ${patient.last_name}` : ""}`,
      message: `${items.length} result(s) reported`,
      referenceType: "lab_requests",
      referenceId: requestId,
    });
  }

  await logAudit(req, ctx, {
    action: "update",
    entityType: "lab_requests",
    entityId: requestId,
    description: `Reported ${items.length} lab result(s) for ${patient ? `${patient.first_name} ${patient.last_name}` : "patient"} and mailed the requesting staff`,
  });

  return ok({ ok: true, reported: items.length, recipients: finalRecipients.length });
});

export const runtime = "nodejs";
