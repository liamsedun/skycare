import { withAuth, ok, ValidationError, NotFoundError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import { tenantCurrency } from "@/lib/server-currency";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export interface DeclarePaymentBody {
  invoiceId: string;
  amount: number;
  paymentMethod?: string;
}

// POST /api/payments/declare — patient declares a bank transfer/POS payment
// (status pending until billing staff confirm via /api/payments/record).
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { symbol } = await tenantCurrency(ctx.svc, tenantId);
  if (ctx.role !== "patient_api") {
    throw new ForbiddenError("Only patients can declare payments");
  }
  const body = (await req.json()) as DeclarePaymentBody;

  if (!body.invoiceId || !body.amount || body.amount <= 0) {
    throw new ValidationError("Invoice and a positive amount are required");
  }

  const method = body.paymentMethod === "pos" ? "pos" : "bank_transfer";

  // Resolve caller's family ids
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
    // caller is a dependant — only the primary holder may pay
    throw new ForbiddenError("Only the main account holder can declare payments");
  }

  const { data: invoice } = await ctx.svc
    .from("invoices")
    .select("id, invoice_number, total_amount, paid_amount, status, patient_id")
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

  const { data: existing } = await ctx.svc
    .from("payments")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("invoice_id", invoice.id)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) throw new ValidationError("A pending declaration already exists for this invoice");

  const reference = `TRF-${String(Date.now()).slice(-10)}`;

  const { data: payment, error } = await ctx.svc
    .from("payments")
    .insert({
      tenant_id: tenantId,
      invoice_id: invoice.id,
      patient_id: invoice.patient_id,
      amount: body.amount,
      payment_method: method,
      status: "pending",
      reference,
      gateway: "offline",
      paid_by: ctx.user.id,
      paid_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  // Notify billing staff to confirm the transfer
  const { data: billingStaff } = await ctx.svc
    .from("users")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("role", ["hospital_admin", "cashier"]);
  const staffIds = (billingStaff ?? []).map((u) => u.id).filter((id) => id !== ctx.user.id);
  if (staffIds.length > 0) {
    await notifyUsers(ctx.svc, {
      orgId: tenantId,
      userIds: staffIds,
      type: "payment_declared",
      title: "New payment declared",
      message: `${reference} — ${symbol}${body.amount.toLocaleString()} for invoice ${invoice.invoice_number} (${method})`,
      referenceType: "payments",
      referenceId: payment.id,
    });
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "payments",
    entityId: payment.id,
    description: `Declared ${method} payment of ${symbol}${body.amount.toLocaleString()} for invoice ${invoice.invoice_number}`,
  });

  return ok(payment, 201);
});

export const runtime = "nodejs";
