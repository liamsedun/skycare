import {
  withAuth,
  ok,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  requireTenant,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { initializeTransaction, getPaystackKeys, generateReference, isPlaceholderKey } from "@/lib/paystack";
import type { NextRequest } from "next/server";
import { rateLimit, API_PAYMENT } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export interface InitializePaymentBody {
  invoiceId: string;
  amount: number;
}

// POST /api/payments/initialize — patient starts an online (Paystack) payment.
// Returns { enabled, authorization_url, access_code, reference } when the
// hospital has real Paystack keys; otherwise { enabled: false } and the client
// falls back to the offline declare flow.
// Rate limited: 20 req/min per IP
export const POST = rateLimit(withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (ctx.role !== "patient_api") {
    throw new ForbiddenError("Only patients can initialize online payments");
  }
  const body = (await req.json()) as InitializePaymentBody;
  if (!body.invoiceId || !body.amount || body.amount <= 0) {
    throw new ValidationError("Invoice and a positive amount are required");
  }

  // Resolve caller's family ids (same rule as /api/payments/declare)
  const { data: patientRows } = await ctx.svc
    .from("patients")
    .select("id, primary_account_id")
    .eq("user_id", ctx.user.id);
  const familyIds = new Set<string>();
  let isDependant = false;
  for (const row of patientRows ?? []) {
    familyIds.add(row.id);
    if (row.primary_account_id) {
      familyIds.add(row.primary_account_id);
      isDependant = true;
    }
  }
  if (isDependant && (patientRows ?? []).some((r) => r.primary_account_id)) {
    throw new ForbiddenError("Only the main account holder can pay online");
  }

  const { data: invoice } = await ctx.svc
    .from("invoices")
    .select("id, invoice_number, total_amount, paid_amount, status, patient_id, tenant_id")
    .eq("id", body.invoiceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!invoice) throw new NotFoundError("Invoice not found");
  if (!familyIds.has(invoice.patient_id)) throw new NotFoundError("Invoice not found");
  if (invoice.status === "paid" || invoice.status === "cancelled" || invoice.status === "refunded") {
    throw new ValidationError(`Invoice is ${invoice.status}`);
  }
  const outstanding = Number(invoice.total_amount) - Number(invoice.paid_amount);
  if (outstanding <= 0) throw new ValidationError("Invoice has no outstanding balance");
  if (Number(body.amount) > outstanding + 0.01) {
    throw new ValidationError("Amount exceeds the outstanding balance");
  }

  const keys = await getPaystackKeys(ctx.svc, tenantId);
  if (!keys.configured || isPlaceholderKey(keys.secretKey)) {
    // No real gateway for this tenant — degrade to the offline flow.
    return ok({ enabled: false }, 200);
  }

  const reference = generateReference(tenantId);
  const origin = req.nextUrl.origin || "http://localhost:3000";
  const callbackUrl = `${origin}/api/payments/callback`;
  const result = await initializeTransaction({
    email: ctx.user.email ?? "",
    amountKobo: Math.round(body.amount * 100),
    reference,
    metadata: {
      tenant_id: tenantId,
      invoice_id: invoice.id,
      patient_id: invoice.patient_id,
      invoice_number: invoice.invoice_number,
    },
    callbackUrl,
    secretKey: keys.secretKey as string,
  });

  await logAudit(req, ctx, {
    action: "create",
    entityType: "payments",
    entityId: null,
    description: `Initialized online payment of ₦${body.amount.toLocaleString()} for invoice ${invoice.invoice_number} (${reference})`,
    changes: { gateway: "paystack", reference },
  });

  return ok({
    enabled: true,
    authorization_url: result.authorization_url,
    access_code: result.access_code,
    reference,
  }, 201);
}), API_PAYMENT);

export const runtime = "nodejs";