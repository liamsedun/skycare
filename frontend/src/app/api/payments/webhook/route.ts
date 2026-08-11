import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getPaystackKeys,
  verifyWebhookSignature,
  isPlaceholderKey,
  type WebhookEvent,
  type PaystackKeys,
} from "@/lib/paystack";
import { notifyUsers } from "@/lib/notify";
import { resolveBankAccountId, postBankLedger } from "@/lib/api-utils";

export const runtime = "nodejs";

// POST /api/payments/webhook
//
// Paystack event endpoint — async, more reliable than the callback redirect.
// Security: HMAC SHA-512 signature verified with the tenant's webhook secret
// (per-tenant keys from tenants.settings.paystack.webhookSecret, env fallback).
// The tenant is resolved from event metadata (tenant_id) — the signature is
// checked against THAT tenant's secret, so forged cross-tenant events fail.
// Idempotency: payments.reference has a partial unique index; existing ref → skip.
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    if (!rawBody) {
      return NextResponse.json({ success: false, error: "Empty body" }, { status: 400 });
    }

    const signature = req.headers.get("x-paystack-signature") || "";
    const event = JSON.parse(rawBody) as WebhookEvent;
    const reference = event.data?.reference;

    if (!event.data?.metadata) {
      // No metadata → nothing we can resolve; reject before trusting the payload.
      return NextResponse.json({ success: false, error: "Missing metadata" }, { status: 400 });
    }
    const tenantId = typeof event.data.metadata.tenant_id === "string" ? event.data.metadata.tenant_id : null;

    const svc = createServiceClient();

    // Resolve the tenant's keys from metadata (payload is verified against that tenant's secret).
    let keys = tenantId
      ? await getPaystackKeys(svc, tenantId)
      : await getPaystackKeys(svc, "").catch(() => ({
          publicKey: null,
          secretKey: process.env.PAYSTACK_SECRET_KEY ?? null,
          webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET ?? null,
          configured: false,
          source: null as PaystackKeys["source"],
        }));

    // Fallback: try to find the payment row to resolve the tenant.
    if (!keys.webhookSecret && reference) {
      const { data: pay } = await svc
        .from("payments")
        .select("tenant_id")
        .eq("reference", reference)
        .maybeSingle();
      if (pay?.tenant_id) keys = await getPaystackKeys(svc, pay.tenant_id);
    }

    if (!verifyWebhookSignature(rawBody, signature, keys.webhookSecret)) {
      return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
    }

    if (event.event !== "charge.success") {
      return NextResponse.json({ success: true, data: { ignored: true, event: event.event } });
    }

    const data = event.data;
    if (!reference) {
      return NextResponse.json({ success: false, error: "Missing reference" }, { status: 400 });
    }

    // Idempotency — unique partial index on payments.reference guards the
    // insert. Walk-in lab payments are pre-recorded as "pending" by
    // POST /api/lab-requests/walk-in; a charge.success completes them here.
    const { data: existing } = await svc
      .from("payments")
      .select("id, invoice_id, status")
      .eq("reference", reference)
      .maybeSingle();

    const invoiceId = data.metadata.invoice_id ?? null;
    const labRequestId = data.metadata.lab_request_id ?? null;
    const patientId = data.metadata.patient_id;
    const amountNaira = Number((data.amount / 100).toFixed(2)); // kobo → Naira
    if (!patientId || !tenantId || (!invoiceId && !labRequestId)) {
      console.error("[Paystack Webhook] Missing metadata", { reference, metadata: data.metadata });
      return NextResponse.json({ success: false, error: "Missing metadata" }, { status: 400 });
    }
    if (isPlaceholderKey(keys.secretKey)) {
      // Should not happen: initialize() refuses placeholder keys, so no real
      // Paystack event can reference a placeholder tenant. Reject defensively.
      return NextResponse.json({ success: false, error: "Gateway not configured" }, { status: 400 });
    }

    const paymentMethod = data.channel === "card" ? "card" : data.channel === "bank_transfer" ? "transfer" : "transfer";
    const paymentMeta = {
      channel: data.channel,
      card_type: data.authorization?.card_type ?? null,
      last4: data.authorization?.last4 ?? null,
      bank: data.authorization?.bank ?? null,
      fees: data.fees ?? null,
      paid_at: data.paid_at ?? null,
    };

    let payment: { id: string; invoice_id: string | null } | null = null;

    if (existing && existing.status === "pending") {
      // Walk-in lab payment: complete the pending row (its invoice_id is null).
      const { data: completed, error: updError } = await svc
        .from("payments")
        .update({
          amount: amountNaira,
          payment_method: paymentMethod,
          status: "completed",
          metadata: paymentMeta,
          paid_at: data.paid_at || new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("id, invoice_id")
        .single();
      if (updError) {
        console.error("[Paystack Webhook] Complete pending payment failed:", updError);
        return NextResponse.json({ success: false, error: updError.message }, { status: 500 });
      }
      payment = completed;
    } else if (existing) {
      return NextResponse.json({ success: true, data: { handled: true, existing: true } });
    } else {
      const { data: inserted, error: payError } = await svc
        .from("payments")
        .insert({
          tenant_id: tenantId,
          invoice_id: invoiceId,
          patient_id: patientId,
          amount: amountNaira,
          payment_method: paymentMethod,
          status: "completed",
          reference,
          gateway: "paystack",
          metadata: paymentMeta,
          paid_by: null,
          paid_at: data.paid_at || new Date().toISOString(),
        })
        .select("id, invoice_id")
        .single();

      if (payError) {
        // Unique-index race: another webhook/callback already recorded it.
        if (payError.code === "23505") {
          return NextResponse.json({ success: true, data: { handled: true, duplicate: true } });
        }
        console.error("[Paystack Webhook] Insert payment failed:", payError);
        return NextResponse.json({ success: false, error: payError.message }, { status: 500 });
      }
      payment = inserted;
    }

    // Update the invoice paid_amount/status (invoice-backed payments).
    let invoice: { invoice_number: string | null } | null = null;
    if (invoiceId) {
      const { data: inv } = await svc
        .from("invoices")
        .select("invoice_number, paid_amount, total_amount")
        .eq("id", invoiceId)
        .single();
      invoice = inv ?? null;
      if (inv) {
        const newPaid = Number(inv.paid_amount) + amountNaira;
        const invStatus = newPaid >= Number(inv.total_amount) - 0.01 ? "paid" : "partially_paid";
        const { error: invError } = await svc
          .from("invoices")
          .update({ paid_amount: newPaid, status: invStatus })
          .eq("id", invoiceId);
        if (invError) console.error("[Paystack Webhook] Invoice update failed:", invError);
      }
    }

    // Link walk-in lab payments to their request (no invoice involved).
    let labRef = "";
    if (labRequestId) {
      const { data: lab } = await svc
        .from("lab_requests")
        .select("id, referrer")
        .eq("id", labRequestId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (lab) {
        await svc.from("lab_requests").update({ payment_id: payment.id }).eq("id", lab.id);
        labRef = lab.referrer ? ` (ref: ${lab.referrer})` : "";
      }
    }

    // Banking ledger auto-post: gateway receipts always credit a bank account
    // (the default active bank, mirroring the pharmacy flow).
    try {
      const defaultBankId = await resolveBankAccountId(svc, tenantId);
      await postBankLedger(svc, {
        tenantId,
        accountId: defaultBankId,
        direction: "in",
        amount: amountNaira,
        source: "payment",
        sourceRef: invoice?.invoice_number ?? labRequestId ?? null,
        paymentId: payment.id,
        method: paymentMethod,
        reference,
        notes: `Online payment via Paystack (${data.channel})${labRef}`,
        recordedAt: data.paid_at || new Date().toISOString(),
        createdBy: null,
      });
    } catch (e) {
      console.error("[Paystack Webhook] Banking ledger post failed:", e);
    }

    // Notify billing staff that the online payment arrived (auto-completed).
    const { data: billingStaff } = await svc
      .from("users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .in("role", ["hospital_admin", "cashier"]);
    const staffIds = (billingStaff ?? []).map((u) => u.id);
    if (staffIds.length > 0) {
      await notifyUsers(svc, {
        orgId: tenantId,
        userIds: staffIds,
        type: "payment_confirmed",
        title: "Online payment received",
        message: `${reference} — ₦${amountNaira.toLocaleString()}${labRef ? " for walk-in lab" : ` for invoice ${invoice?.invoice_number ?? ""}`} (Paystack)`,
        referenceType: "payments",
        referenceId: payment.id,
      });
    }

    // Audit via service client (webhook has no user session).
    try {
      await svc.from("audit_logs").insert({
        tenant_id: tenantId,
        user_id: null,
        role: "paystack_webhook",
        action: "create",
        entity_type: "payments",
        entity_id: payment.id,
        changes: { reference, amount: amountNaira, channel: data.channel, invoice_id: invoiceId, lab_request_id: labRequestId },
        description: `Paystack webhook recorded payment ${reference} (₦${amountNaira.toLocaleString()})${labRef ? ` for walk-in lab request ${labRequestId}` : ` for invoice ${invoice?.invoice_number ?? ""}`}`,
      });
    } catch {
      /* audit must not break the webhook */
    }

    return NextResponse.json({ success: true, data: { handled: true } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Webhook error";
    if (err instanceof SyntaxError) {
      return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
    }
    console.error("[Paystack Webhook] Error:", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
