import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit, logView } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const DETAIL_SELECT =
  "id, invoice_number, source, branch_id, patient_id, visit_id, prescription_id, subtotal, discount_amount, tax_amount, total_amount, paid_amount, status, insurance_claimable, notes, synced_invoice_id, created_by, created_at, paid_at, patients(id, patient_number, first_name, last_name, phone, email, gender), pharmacy_invoice_items(id, drug_id, drug_name, quantity, unit_price, total_price, is_covered, co_pay_amount), pharmacy_payments(id, amount, method, reference, status, received_by, received_at, notes, synced_payment_id)";

// GET /api/pharmacy/invoices/[id]
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").at(-1)!;
  const { data: invoice, error } = await ctx.svc
    .from("pharmacy_invoices")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();
  if (error) throw new NotFoundError("Pharmacy invoice not found");

  await logView(req, ctx, "pharmacy_invoices", id, `Viewed pharmacy invoice ${invoice.invoice_number}`);
  return ok(invoice);
});

// DELETE /api/pharmacy/invoices/[id] — cancel an unpaid invoice (e.g. the
// stock dispense for a counter sale failed). Refuses when money has moved:
// any pharmacy payment, any insurance claim, or any payment on the mirrored
// central invoice. On success the mirrored central invoice is removed too.
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").at(-1)!;

  const { data: invoice } = await ctx.svc
    .from("pharmacy_invoices")
    .select("id, invoice_number, status, synced_invoice_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!invoice) throw new NotFoundError("Pharmacy invoice not found");
  if (invoice.status !== "unpaid") {
    throw new ValidationError(`Cannot cancel an invoice with status "${invoice.status}"`);
  }

  const [paymentsRes, claimsRes] = await Promise.all([
    ctx.svc
      .from("pharmacy_payments")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", id)
      .eq("tenant_id", tenantId),
    ctx.svc
      .from("insurance_claims")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", id)
      .eq("tenant_id", tenantId),
  ]);
  if ((paymentsRes.count ?? 0) > 0) {
    throw new ValidationError(`Invoice ${invoice.invoice_number} has payments — cancel it instead of deleting`);
  }
  if ((claimsRes.count ?? 0) > 0) {
    throw new ValidationError(`Invoice ${invoice.invoice_number} has insurance claims — cancel it instead of deleting`);
  }

  // The mirrored central invoice: remove it only if no money reached it.
  let centralRemoved = false;
  if (invoice.synced_invoice_id) {
    const { count: centralPayments } = await ctx.svc
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", invoice.synced_invoice_id)
      .eq("tenant_id", tenantId);
    if ((centralPayments ?? 0) === 0) {
      const { error: centralError } = await ctx.svc
        .from("invoices")
        .delete()
        .eq("id", invoice.synced_invoice_id)
        .eq("tenant_id", tenantId);
      if (!centralError) centralRemoved = true;
    }
  }

  const { error } = await ctx.svc
    .from("pharmacy_invoices")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "pharmacy_invoices",
    entityId: id,
    description: `Pharmacy invoice ${invoice.invoice_number} cancelled${centralRemoved ? " (central mirror removed)" : ""}`,
  });

  return ok({ id, centralRemoved });
});