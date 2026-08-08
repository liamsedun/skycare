import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const METHOD_MAP: Record<string, string> = {
  cash: "cash",
  pos: "pos",
  transfer: "transfer",
  card: "card",
  insurance: "insurance",
};

interface PaymentSplit {
  method: "cash" | "pos" | "transfer" | "card" | "insurance";
  amount: number;
  reference?: string;
  notes?: string;
}

export interface RecordPharmacyPaymentsBody {
  invoiceId: string;
  payments: PaymentSplit[];
  branchId?: string | null;
}

// POST /api/pharmacy/payments — record one or more payment splits against a
// pharmacy invoice. Overpaying is rejected by the engine; the invoice is
// auto-closed when fully paid. Payments sync to the central ledger row.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as RecordPharmacyPaymentsBody;

  if (!body.invoiceId) throw new ValidationError("invoiceId is required");
  if (!Array.isArray(body.payments) || body.payments.length === 0) {
    throw new ValidationError("At least one payment split is required");
  }
  for (const p of body.payments) {
    if (!p.method || !(p.method in METHOD_MAP)) {
      throw new ValidationError(`Invalid payment method: ${p.method}`);
    }
    if (!Number.isFinite(Number(p.amount)) || Number(p.amount) <= 0) {
      throw new ValidationError("Each payment split needs a positive amount");
    }
  }

  const { data: invoice } = await ctx.svc
    .from("pharmacy_invoices")
    .select("id, invoice_number, patient_id, total_amount, synced_invoice_id")
    .eq("id", body.invoiceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!invoice) throw new NotFoundError("Pharmacy invoice not found");

  const { data: paymentIds, error } = await ctx.svc.rpc("pharmacy_invoice_pay", {
    p_tenant_id: tenantId,
    p_invoice_id: body.invoiceId,
    p_payments: body.payments.map((p) => ({
      method: p.method,
      amount: Number(p.amount),
      reference: p.reference?.trim() || null,
      notes: p.notes?.trim() || null,
    })),
    p_user_id: ctx.user.id,
    p_branch_id: body.branchId ?? null,
  });
  if (error) throw new ValidationError(error.message);

  const { data: afterInvoice, error: afterError } = await ctx.svc
    .from("pharmacy_invoices")
    .select("id, total_amount, paid_amount, status, paid_at, patient_id, invoice_number")
    .eq("id", body.invoiceId)
    .single();
  if (afterError || !afterInvoice) throw new ValidationError(afterError?.message ?? "Invoice not found");

  // Central-ledger sync: mirror each split as a central payment row and keep
  // the mirrored invoice's paid_amount/status in lockstep.
  if (invoice.synced_invoice_id) {
    for (let i = 0; i < body.payments.length; i++) {
      const p = body.payments[i];
      const { data: centralPayment, error: syncError } = await ctx.svc
        .from("payments")
        .insert({
          tenant_id: tenantId,
          branch_id: body.branchId ?? null,
          invoice_id: invoice.synced_invoice_id,
          patient_id: invoice.patient_id,
          amount: Number(p.amount),
          payment_method: METHOD_MAP[p.method],
          status: "completed",
          reference: p.reference?.trim() || null,
          gateway: "pharmacy",
          paid_by: ctx.user.id,
          paid_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (!syncError && centralPayment && paymentIds?.[i]) {
        await ctx.svc
          .from("pharmacy_payments")
          .update({ synced_payment_id: centralPayment.id })
          .eq("id", paymentIds[i]);
      }
    }
    await ctx.svc
      .from("invoices")
      .update({
        paid_amount: Number(afterInvoice.paid_amount),
        status:
          Number(afterInvoice.paid_amount) >= Number(invoice.total_amount) - 0.01
            ? "paid"
            : Number(afterInvoice.paid_amount) > 0
              ? "partially_paid"
              : "pending",
      })
      .eq("id", invoice.synced_invoice_id);
  }

  const totalPaid = body.payments.reduce((s, p) => s + Number(p.amount), 0);
  if (afterInvoice.patient_id) {
    await notifyUsers(ctx.svc, {
      orgId: tenantId,
      userIds: [afterInvoice.patient_id],
      type: "payment_confirmed",
      title: "Pharmacy payment received",
      message: `${afterInvoice.invoice_number} — ₦${totalPaid.toLocaleString()}`,
      referenceType: "payments",
      referenceId: paymentIds?.[0],
    });
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "pharmacy_payments",
    entityId: paymentIds?.[0],
    description: `Pharmacy payment ₦${totalPaid.toLocaleString()} (${body.payments.length} split(s)) on ${invoice.invoice_number}`,
  });

  return ok({ paymentIds, invoice: afterInvoice }, 201);
});

// GET /api/pharmacy/payments?invoiceId=&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const invoiceId = req.nextUrl.searchParams.get("invoiceId");
  let query = ctx.svc
    .from("pharmacy_payments")
    .select("id, invoice_id, amount, method, reference, status, received_by, received_at, notes, pharmacy_invoices(invoice_number, patients(first_name, last_name))")
    .eq("tenant_id", tenantId)
    .order("received_at", { ascending: false });
  if (invoiceId) query = query.eq("invoice_id", invoiceId);
  const { data, error } = await query;
  if (error) throw new ValidationError(error.message);
  return ok(data ?? []);
});

export const runtime = "nodejs";