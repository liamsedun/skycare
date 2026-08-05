import { withAuth, ok, ValidationError, NotFoundError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_METHODS = [
  "cash",
  "card",
  "transfer",
  "bank_transfer",
  "pos",
  "mobile_money",
  "insurance",
  "nhia",
  "bank_deposit",
];

export interface RecordPaymentBody {
  patientId: string;
  amount: number;
  paymentMethod: string;
  allocation: Array<{ invoiceId: string; amount: number }>;
  transactionRef?: string;
  notes?: string;
  pendingPaymentId?: string;
}

// POST /api/payments/record — staff confirms payment and allocates to invoices.
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!["hospital_admin", "cashier", "super_admin"].includes(ctx.role)) {
    throw new ForbiddenError("Billing access required");
  }
  const body = (await req.json()) as RecordPaymentBody;

  if (!body.patientId || !body.amount || body.amount <= 0) {
    throw new ValidationError("Patient and a positive amount are required");
  }
  if (!ALLOWED_METHODS.includes(body.paymentMethod)) {
    throw new ValidationError("Invalid payment method");
  }
  if (!Array.isArray(body.allocation) || body.allocation.length === 0) {
    throw new ValidationError("At least one invoice allocation is required");
  }
  const totalAllocated = body.allocation.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  if (Math.abs(totalAllocated - body.amount) > 0.01) {
    throw new ValidationError("Allocation amounts must equal the payment amount");
  }

  const { data: patient } = await ctx.svc
    .from("patients")
    .select("id, first_name, last_name, user_id")
    .eq("id", body.patientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!patient) throw new NotFoundError("Patient not found");

  const reference =
    body.transactionRef?.trim() ||
    `RCPT-${String(Date.now()).slice(-10)}`;

  // If a patient declaration is being confirmed, reuse it instead of inserting.
  let pendingPayment: any = null;
  if (body.pendingPaymentId) {
    const { data: pending } = await ctx.svc
      .from("payments")
      .select("id, invoice_id, patient_id, amount, status")
      .eq("id", body.pendingPaymentId)
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .maybeSingle();
    if (!pending) throw new NotFoundError("Pending payment not found");
    pendingPayment = pending;
  }

  const createdPayments = [];
  const touchedInvoices = [];

  for (const item of body.allocation) {
    const { data: invoice } = await ctx.svc
      .from("invoices")
      .select("id, invoice_number, total_amount, paid_amount, status")
      .eq("id", item.invoiceId)
      .eq("tenant_id", tenantId)
      .eq("patient_id", body.patientId)
      .maybeSingle();
    if (!invoice) throw new NotFoundError("Invoice not found for allocation");
    if (invoice.status === "cancelled" || invoice.status === "refunded") {
      throw new ValidationError(`Invoice ${invoice.invoice_number} is ${invoice.status}`);
    }
    const outstanding = Number(invoice.total_amount) - Number(invoice.paid_amount);
    if (Number(item.amount) > outstanding + 0.01) {
      throw new ValidationError(
        `Amount for ${invoice.invoice_number} exceeds the outstanding balance`
      );
    }

    let payment: any;
    if (pendingPayment && pendingPayment.invoice_id === invoice.id) {
      // Confirm the declared payment for this invoice
      const { data: confirmed, error: confirmError } = await ctx.svc
        .from("payments")
        .update({
          status: "completed",
          paid_by: ctx.user.id,
          reference: pendingPayment.reference,
        })
        .eq("id", pendingPayment.id)
        .select()
        .single();
      if (confirmError) throw new ValidationError(confirmError.message);
      payment = confirmed;
      pendingPayment = null; // consumed
    } else {
      const { data: inserted, error } = await ctx.svc
        .from("payments")
        .insert({
          tenant_id: tenantId,
          branch_id: ctx.branchId ?? null,
          invoice_id: invoice.id,
          patient_id: body.patientId,
          amount: item.amount,
          payment_method: body.paymentMethod,
          status: "completed",
          reference,
          gateway: "offline",
          paid_by: ctx.user.id,
          paid_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw new ValidationError(error.message);
      payment = inserted;
    }
    const newPaid = Number(invoice.paid_amount) + Number(item.amount);
    const { data: updatedInvoice } = await ctx.svc
      .from("invoices")
      .update({
        paid_amount: Math.round(newPaid * 100) / 100,
        status: newPaid >= Number(invoice.total_amount) - 0.01 ? "paid" : "partially_paid",
      })
      .eq("id", invoice.id)
      .select()
      .single();

    createdPayments.push(payment);
    touchedInvoices.push(updatedInvoice);
  }

  // Notify the patient's portal account and other billing staff
  if (patient.user_id) {
    await notifyUsers(ctx.svc, {
      orgId: tenantId,
      userIds: [patient.user_id],
      type: "payment_confirmed",
      title: "Payment confirmed",
      message: `${reference} — ₦${body.amount.toLocaleString()}`,
      referenceType: "payments",
      referenceId: createdPayments[0]?.id,
    });
  }
  const { data: billingStaff } = await ctx.svc
    .from("users")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("role", ["hospital_admin", "cashier"]);
  const others = (billingStaff ?? [])
    .map((u) => u.id)
    .filter((id) => id !== ctx.user.id);
  if (others.length > 0) {
    await notifyUsers(ctx.svc, {
      orgId: tenantId,
      userIds: others,
      type: "payment_confirmed",
      title: "Payment recorded",
      message: `${reference} — ₦${body.amount.toLocaleString()} for ${patient.first_name} ${patient.last_name}`,
      referenceType: "payments",
      referenceId: createdPayments[0]?.id,
    });
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "payments",
    entityId: createdPayments[0]?.id,
    description: `Recorded payment ${reference} of ₦${body.amount.toLocaleString()} (${body.paymentMethod}) for ${patient.first_name} ${patient.last_name}`,
  });

  return ok({ payments: createdPayments, invoices: touchedInvoices }, 201);
});

export const runtime = "nodejs";
