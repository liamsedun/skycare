import { withStaff, ok, okPaginated, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { mirrorPharmacyInvoiceToCentral } from "@/lib/pharmacy-billing";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const INVOICE_SELECT =
  "id, invoice_number, source, branch_id, patient_id, visit_id, prescription_id, subtotal, discount_amount, tax_amount, total_amount, paid_amount, status, insurance_claimable, notes, synced_invoice_id, created_by, created_at, paid_at, patients(id, patient_number, first_name, last_name, phone), pharmacy_invoice_items(id, drug_id, drug_name, quantity, unit_price, total_price, is_covered, co_pay_amount)";

export interface CreatePharmacyInvoiceBody {
  branchId?: string | null;
  patientId?: string | null;
  visitId?: string | null;
  prescriptionId?: string | null;
  source: "counter" | "prescription" | "ward";
  items: Array<{ drugId: string; quantity: number; unit_price?: number | null }>;
  discount?: number;
  taxRate?: number;
  claimable?: boolean;
  notes?: string;
}

// GET /api/pharmacy/invoices?patient_id=&status=&source=&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const patientId = resolveParam(req.nextUrl.searchParams.get("patient_id"));
  const status = resolveParam(req.nextUrl.searchParams.get("status"));
  const source = resolveParam(req.nextUrl.searchParams.get("source"));

  let query = ctx.svc
    .from("pharmacy_invoices")
    .select(INVOICE_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);
  if (patientId) query = query.eq("patient_id", patientId);
  if (source) query = query.eq("source", source);

  const { data, count, error } = await query;
  if (error) throw new ValidationError(error.message);
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

// POST /api/pharmacy/invoices — create invoice (auto numbering; per-line price
// resolution; syncs to the central ledger when a patient is attached).
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as CreatePharmacyInvoiceBody;

  if (!["counter", "prescription", "ward"].includes(body.source)) {
    throw new ValidationError("source must be counter, prescription or ward");
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ValidationError("At least one invoice item is required");
  }
  for (const item of body.items) {
    if (!item.drugId || Math.floor(Number(item.quantity) || 0) <= 0) {
      throw new ValidationError("Each item needs a drugId and a positive quantity");
    }
  }

  let patientName = "counter sale";
  if (body.patientId) {
    const { data: patient } = await ctx.svc
      .from("patients")
      .select("id, first_name, last_name")
      .eq("id", body.patientId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!patient) throw new NotFoundError("Patient not found");
    patientName = `${patient.first_name} ${patient.last_name}`;
  }

  const { data: invoiceId, error } = await ctx.svc.rpc("pharmacy_invoice_create", {
    p_tenant_id: tenantId,
    p_branch_id: body.branchId ?? null,
    p_patient_id: body.patientId ?? null,
    p_visit_id: body.visitId ?? null,
    p_source: body.source,
    p_items: body.items.map((i) => ({
      drug_id: i.drugId,
      quantity: Math.floor(Number(i.quantity) || 0),
      unit_price: i.unit_price == null ? null : Number(i.unit_price),
    })),
    p_discount: Number(body.discount) || 0,
    p_tax_rate: Number(body.taxRate) || 0,
    p_prescription_id: body.prescriptionId ?? null,
    p_claimable: body.claimable ?? false,
    p_notes: body.notes?.trim() || null,
    p_created_by: ctx.user.id,
  });
  if (error) throw new ValidationError(error.message);

  const { data: invoice, error: fetchError } = await ctx.svc
    .from("pharmacy_invoices")
    .select(INVOICE_SELECT)
    .eq("id", invoiceId)
    .single();
  if (fetchError) throw new ValidationError(fetchError.message);

  // Central-ledger sync (best effort): mirror the invoice so cashier billing
  // dashboards and the patient portal see pharmacy charges under one ledger.
  await mirrorPharmacyInvoiceToCentral(ctx.svc, tenantId, invoice, ctx.user.id);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "pharmacy_invoices",
    entityId: invoice.id,
    description: `Pharmacy invoice ${invoice.invoice_number} created (${invoice.source}) for ${patientName} — ₦${Number(invoice.total_amount).toLocaleString()}`,
  });

  return ok(invoice, 201);
});

export const runtime = "nodejs";