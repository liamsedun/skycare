import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logView } from "@/lib/audit";
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