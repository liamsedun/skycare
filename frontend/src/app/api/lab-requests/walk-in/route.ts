import {
  withStaff,
  ok,
  ValidationError,
  requireTenant,
  requireModuleLevel,
  resolveBankAccountId,
  bankLedgerAccountForMethod,
  postBankLedger,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { getTenantSettings, generatePatientNumber } from "@/lib/tenant-settings";
import { initializeTransaction, getPaystackKeys, generateReference, isPlaceholderKey } from "@/lib/paystack";
import { pushNotifyUsers } from "@/lib/push-send";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Walk-in customers pay up-front. Credit is never offered to them.
const WALKIN_METHODS = ["cash", "bank_transfer", "paystack"];

export interface WalkInLabRequestBody {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  gender?: string;
  dateOfBirth?: string;
  referrer?: string;
  doctorId?: string;
  notes?: string;
  assignedToIds?: string[];
  paymentMethod: string;
  transactionRef?: string;
  items: Array<{
    serviceId?: string;
    serviceName?: string;
    priority?: string;
    sampleType?: string;
    notes?: string;
  }>;
}

// POST /api/lab-requests/walk-in — a lab request from a customer who is not
// on the hospital's books (drop-in customer or referral from another clinic).
// The patient record is fast-created (no portal login), the request is raised,
// and payment is collected instantly — cash / bank transfer / Paystack. No
// invoice is raised (a payment receipt is the proof), so no credit is possible.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  await requireModuleLevel(ctx, "lab", "full");

  const body = (await req.json()) as WalkInLabRequestBody;

  if (!body.firstName?.trim() || !body.lastName?.trim()) {
    throw new ValidationError("Walk-in customer first and last names are required");
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ValidationError("At least one service is required");
  }
  if (!WALKIN_METHODS.includes(body.paymentMethod)) {
    throw new ValidationError("Walk-in requests must be paid instantly (cash, bank transfer or Paystack)");
  }
  if (body.paymentMethod === "paystack" && !body.email?.trim()) {
    throw new ValidationError("An email is required for Paystack payments");
  }

  // 1. Fast-create the walk-in patient record (no portal login).
  const settings = await getTenantSettings(ctx.svc, tenantId);
  const patientNumber = await generatePatientNumber(ctx.svc, tenantId, settings.patientPrefix);
  const { data: patient, error: patientError } = await ctx.svc
    .from("patients")
    .insert({
      tenant_id: tenantId,
      branch_id: ctx.branchId ?? null,
      patient_number: patientNumber,
      user_id: null,
      first_name: body.firstName.trim(),
      last_name: body.lastName.trim(),
      gender: body.gender?.trim() || null,
      date_of_birth: body.dateOfBirth || null,
      phone: body.phone?.trim() || null,
      email: body.email?.trim().toLowerCase() || null,
      is_primary_account: false,
      primary_account_id: null,
      is_walk_in: true,
      status: "active",
    })
    .select()
    .single();
  if (patientError) throw new ValidationError(patientError.message);

  const rollbackPatient = () =>
    ctx.svc.from("patients").delete().eq("id", patient.id).eq("tenant_id", tenantId).then(() => undefined);

  // 2. Raise the request + items through the same transactional RPC used for
  //    in-house requests (validates services, snapshots names, fires the
  //    deferred notification trigger to lab staff).
  const { data: created, error: rpcError } = await ctx.svc.rpc("create_lab_request", {
    p_patient_id: patient.id,
    p_services: body.items.map((i) => ({
      serviceId: i.serviceId ?? null,
      serviceName: i.serviceName ?? null,
      priority: i.priority || "routine",
      sampleType: i.sampleType?.trim() || null,
      notes: i.notes?.trim() || null,
    })),
    p_is_external: false,
    p_external_lab_id: null,
    p_doctor_id: body.doctorId || null,
    p_branch_id: ctx.branchId ?? null,
    p_notes: (body.referrer ? `Referrer: ${body.referrer.trim()}. ` : "") + (body.notes?.trim() ?? ""),
    p_created_by: ctx.user.id,
    p_assigned_user_ids: body.assignedToIds?.length ? body.assignedToIds : null,
  });
  if (rpcError) {
    await rollbackPatient();
    throw new ValidationError(rpcError.message);
  }
  const request = created as { id: string; lab_request_items?: Array<{ service_name: string }> };

  // 3. Price the selected services from the catalogue (same rule as invoicing).
  const serviceIds = body.items
    .map((i) => i.serviceId)
    .filter((id): id is string => Boolean(id));
  const priceById = new Map<string, number>();
  if (serviceIds.length > 0) {
    const { data: services } = await ctx.svc
      .from("lab_services")
      .select("id, price")
      .eq("tenant_id", tenantId)
      .in("id", serviceIds);
    for (const s of services ?? []) priceById.set(s.id, s.price);
  }
  const total = body.items.reduce(
    (sum, i) => sum + (priceById.get(i.serviceId ?? "") ?? 0),
    0
  );
  if (total <= 0) {
    await ctx.svc.from("lab_requests").delete().eq("id", request.id).eq("tenant_id", tenantId);
    await rollbackPatient();
    throw new ValidationError("No catalogue price found for the selected services — ask an admin to set prices first");
  }

  // 4. Record the instant payment. Paystack is pre-recorded as pending and
  //    completed by the webhook; cash/bank transfer are completed now.
  let payment: { id: string; reference: string; status: string; payment_method: string | null };
  let authorizationUrl: string | null = null;

  if (body.paymentMethod === "paystack") {
    const keys = await getPaystackKeys(ctx.svc, tenantId);
    if (!keys.configured || isPlaceholderKey(keys.secretKey)) {
      await ctx.svc.from("lab_requests").delete().eq("id", request.id).eq("tenant_id", tenantId);
      await rollbackPatient();
      throw new ValidationError("Paystack is not configured for this hospital");
    }
    const reference = generateReference(tenantId);
    const { data: pendingPay, error: pendError } = await ctx.svc
      .from("payments")
      .insert({
        tenant_id: tenantId,
        invoice_id: null,
        patient_id: patient.id,
        amount: total,
        // payment_method enum has no "paystack" — the webhook rewrites this to
        // "card"/"transfer" from the charge channel on success.
        payment_method: "card",
        status: "pending",
        reference,
        gateway: "paystack",
        paid_by: ctx.user.id,
        paid_at: new Date().toISOString(),
        metadata: { source: "lab_walk_in", lab_request_id: request.id },
      })
      .select()
      .single();
    if (pendError) {
      await ctx.svc.from("lab_requests").delete().eq("id", request.id).eq("tenant_id", tenantId);
      await rollbackPatient();
      throw new ValidationError(pendError.message);
    }
    payment = pendingPay;
    const origin = req.nextUrl.origin || "http://localhost:3000";
    let result: { authorization_url: string };
    try {
      result = await initializeTransaction({
        email: body.email!.trim(),
        amountKobo: Math.round(total * 100),
        reference,
        metadata: {
          tenant_id: tenantId,
          patient_id: patient.id,
          lab_request_id: request.id,
          source: "lab_walk_in",
        },
        callbackUrl: `${origin}/api/payments/callback?source=lab`,
        secretKey: keys.secretKey as string,
      });
    } catch (e) {
      await ctx.svc.from("payments").delete().eq("id", payment.id);
      await ctx.svc.from("lab_requests").delete().eq("id", request.id).eq("tenant_id", tenantId);
      await rollbackPatient();
      throw new ValidationError(e instanceof Error ? e.message : "Failed to initialize Paystack payment");
    }
    if (!result.authorization_url) {
      await ctx.svc.from("payments").delete().eq("id", payment.id);
      await ctx.svc.from("lab_requests").delete().eq("id", request.id).eq("tenant_id", tenantId);
      await rollbackPatient();
      throw new ValidationError("Failed to initialize Paystack payment");
    }
    authorizationUrl = result.authorization_url;
  } else {
    const reference = body.transactionRef?.trim() || `LAB-${String(Date.now()).slice(-10)}`;
    const { data: insertedPay, error: payError } = await ctx.svc
      .from("payments")
      .insert({
        tenant_id: tenantId,
        invoice_id: null,
        patient_id: patient.id,
        amount: total,
        payment_method: body.paymentMethod,
        status: "completed",
        reference,
        gateway: "offline",
        paid_by: ctx.user.id,
        paid_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (payError) {
      await ctx.svc.from("lab_requests").delete().eq("id", request.id).eq("tenant_id", tenantId);
      await rollbackPatient();
      throw new ValidationError(payError.message);
    }
    payment = insertedPay;

    const defaultBankId = await resolveBankAccountId(ctx.svc, tenantId);
    try {
      await postBankLedger(ctx.svc, {
        tenantId,
        branchId: ctx.branchId ?? null,
        accountId: bankLedgerAccountForMethod(payment.payment_method, defaultBankId),
        direction: "in",
        amount: total,
        source: "payment",
        sourceRef: request.id,
        paymentId: payment.id,
        method: payment.payment_method,
        reference,
        notes: `Lab walk-in payment — ${patient.first_name} ${patient.last_name}${body.referrer ? ` (ref: ${body.referrer})` : ""}`,
        recordedAt: new Date().toISOString(),
        createdBy: ctx.user.id,
      });
    } catch (e) {
      console.error("banking-ledger post failed", e);
    }
  }

  // 5. Link the up-front payment to the request.
  const { error: linkError } = await ctx.svc
    .from("lab_requests")
    .update({ payment_id: payment.id, referrer: body.referrer?.trim() || null })
    .eq("id", request.id)
    .eq("tenant_id", tenantId);
  if (linkError) throw new ValidationError(linkError.message);

  // 6. Web-push the same recipients the notification trigger wrote.
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
      title: "Walk-in lab tests ordered",
      body: `${request.lab_request_items?.length ?? body.items.length} service(s) for walk-in ${patient.first_name} ${patient.last_name}`,
      referenceType: "lab_requests",
      referenceId: request.id,
    });
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "lab_requests",
    entityId: request.id,
    description: `Walk-in lab request (${request.lab_request_items?.length ?? body.items.length} item(s)) for ${patient.first_name} ${patient.last_name} — paid ₦${total.toLocaleString()} (${payment.payment_method ?? body.paymentMethod})${body.referrer ? `, referrer ${body.referrer}` : ""}`,
  });

  return ok(
    {
      request,
      patient,
      payment,
      total,
      authorization_url: authorizationUrl,
      receipt_url: authorizationUrl ? null : `/app/lab/receipt/${request.id}`,
    },
    201
  );
});

export const runtime = "nodejs";
