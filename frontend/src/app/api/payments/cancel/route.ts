import { withAuth, ok, ValidationError, NotFoundError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/payments/cancel — billing staff cancels a patient's pending declaration.
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!["hospital_admin", "cashier", "super_admin"].includes(ctx.role)) {
    throw new ForbiddenError("Billing access required");
  }
  const body = (await req.json()) as { pendingPaymentId?: string };
  if (!body.pendingPaymentId) throw new ValidationError("pendingPaymentId is required");

  const { data: payment } = await ctx.svc
    .from("payments")
    .select("id, invoice_id, patient_id, amount, payment_method, reference")
    .eq("id", body.pendingPaymentId)
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .maybeSingle();
  if (!payment) throw new NotFoundError("Pending payment not found");

  const { data: updated, error } = await ctx.svc
    .from("payments")
    .update({
      status: "cancelled",
      paid_by: ctx.user.id,
    })
    .eq("id", payment.id)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  // Notify the patient
  const { data: patient } = await ctx.svc
    .from("patients")
    .select("user_id, first_name, last_name")
    .eq("id", payment.patient_id)
    .maybeSingle();
  if (patient?.user_id) {
    await notifyUsers(ctx.svc, {
      orgId: tenantId,
      userIds: [patient.user_id],
      type: "payment_cancelled",
      title: "Payment not confirmed",
      message: `${payment.reference} — the ${payment.payment_method} payment was not confirmed. Contact the hospital.`,
      referenceType: "payments",
      referenceId: payment.id,
    });
  }

  await logAudit(req, ctx, {
    action: "update",
    entityType: "payments",
    entityId: payment.id,
    description: `Cancelled pending ${payment.payment_method} of ₦${Number(payment.amount).toLocaleString()} (${payment.reference})`,
  });

  return ok(updated);
});

export const runtime = "nodejs";
