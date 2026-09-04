import { withStaff, ok, okPaginated, ValidationError, NotFoundError, requireTenant, getPagination, resolveParam } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const CLAIM_SELECT =
  "id, claim_number, invoice_id, pharmacy_invoice_id, patient_id, provider_id, policy_id, authorization_id, encounter_date, encounter_type, diagnosis_code, diagnosis_description, service_code, items, total_billed, total_covered, total_co_pay, status, submitted_at, processed_at, paid_at, payment_reference, notes, created_by, processed_by, created_at, updated_at, patients!hmo_claims_patient_id_fkey(id, first_name, last_name, patient_number), insurance_providers!hmo_claims_provider_id_fkey(id, name, provider_type)";

// GET /api/insurance/claims?status=&provider_id=&patient_id=&encounter_type=&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const status = resolveParam(req.nextUrl.searchParams.get("status"));
  const providerId = resolveParam(req.nextUrl.searchParams.get("provider_id"));
  const patientId = resolveParam(req.nextUrl.searchParams.get("patient_id"));
  const encounterType = resolveParam(req.nextUrl.searchParams.get("encounter_type"));

  let query = ctx.svc
    .from("hmo_claims")
    .select(CLAIM_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);
  if (providerId) query = query.eq("provider_id", providerId);
  if (patientId) query = query.eq("patient_id", patientId);
  if (encounterType) query = query.eq("encounter_type", encounterType);

  const { data, count, error } = await query;
  if (error) throw new ValidationError(error.message);
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

interface ClaimBody {
  invoiceId?: string | null;
  pharmacyInvoiceId?: string | null;
  patientId: string;
  providerId: string;
  policyId?: string | null;
  authorizationId?: string | null;
  encounterDate?: string;
  encounterType: string;
  diagnosisCode?: string | null;
  diagnosisDescription?: string | null;
  serviceCode?: string | null;
  items?: any[];
  totalBilled?: number;
  notes?: string | null;
}

const VALID_ENCOUNTER_TYPES = ["outpatient", "inpatient", "emergency", "pharmacy", "lab", "maternity", "other"];

function validateClaimBody(body: any): ClaimBody {
  if (!body?.invoiceId && !body?.pharmacyInvoiceId) {
    throw new ValidationError("Either invoiceId or pharmacyInvoiceId is required");
  }
  if (!body?.patientId?.trim()) throw new ValidationError("Patient ID is required");
  if (!body?.providerId?.trim()) throw new ValidationError("Provider ID is required");
  if (!body?.encounterType?.trim()) throw new ValidationError("Encounter type is required");
  if (!VALID_ENCOUNTER_TYPES.includes(body.encounterType.trim())) {
    throw new ValidationError(`Encounter type must be one of: ${VALID_ENCOUNTER_TYPES.join(", ")}`);
  }
  return {
    invoiceId: body.invoiceId?.trim() || null,
    pharmacyInvoiceId: body.pharmacyInvoiceId?.trim() || null,
    patientId: body.patientId.trim(),
    providerId: body.providerId.trim(),
    policyId: body.policyId?.trim() || null,
    authorizationId: body.authorizationId?.trim() || null,
    encounterDate: body.encounterDate?.trim() || new Date().toISOString().slice(0, 10),
    encounterType: body.encounterType.trim(),
    diagnosisCode: body.diagnosisCode?.trim() || null,
    diagnosisDescription: body.diagnosisDescription?.trim() || null,
    serviceCode: body.serviceCode?.trim() || null,
    items: body.items ?? [],
    totalBilled: body.totalBilled ?? 0,
    notes: body.notes?.trim() || null,
  };
}

// POST /api/insurance/claims — create from invoice
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = validateClaimBody(await req.json());

  // Generate claim number via RPC
  const { data: claimNumber, error: rpcError } = await ctx.svc.rpc("next_hmo_claim_number", {
    p_tenant: tenantId,
  });
  if (rpcError) throw new ValidationError(rpcError.message);

  // Auto-compute totals from invoice items if invoice provided
  let items = body.items;
  let totalBilled = body.totalBilled;

  if (body.invoiceId) {
    const { data: invoice } = await ctx.svc
      .from("invoices")
      .select("id, total_amount, items:invoice_items(id, description, quantity, unit_price, total)")
      .eq("id", body.invoiceId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!invoice) throw new NotFoundError("Invoice not found");
    totalBilled = totalBilled || Number(invoice.total_amount);
    if (invoice.items && invoice.items.length > 0) {
      items = invoice.items.map((item: any) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        total: Number(item.total),
      }));
    }
  } else if (body.pharmacyInvoiceId) {
    const { data: pharmacyInvoice } = await ctx.svc
      .from("pharmacy_invoices")
      .select("id, total_amount")
      .eq("id", body.pharmacyInvoiceId)
      .maybeSingle();
    if (!pharmacyInvoice) throw new NotFoundError("Pharmacy invoice not found");
    totalBilled = totalBilled || Number(pharmacyInvoice.total_amount);
  }

  // Look up active policy if not provided
  let policyId = body.policyId;
  if (!policyId) {
    const { data: policy } = await ctx.svc
      .from("insurance_policies")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("patient_id", body.patientId)
      .eq("provider_id", body.providerId)
      .eq("status", "active")
      .eq("is_primary", true)
      .maybeSingle();
    policyId = policy?.id ?? null;
  }

  const { data, error } = await ctx.svc
    .from("hmo_claims")
    .insert({
      tenant_id: tenantId,
      claim_number: claimNumber,
      invoice_id: body.invoiceId,
      pharmacy_invoice_id: body.pharmacyInvoiceId,
      patient_id: body.patientId,
      provider_id: body.providerId,
      policy_id: policyId,
      authorization_id: body.authorizationId,
      encounter_date: body.encounterDate,
      encounter_type: body.encounterType,
      diagnosis_code: body.diagnosisCode,
      diagnosis_description: body.diagnosisDescription,
      service_code: body.serviceCode,
      items: items,
      total_billed: totalBilled,
      notes: body.notes,
      created_by: ctx.user.id,
      status: "draft",
    })
    .select("id, claim_number, total_billed, status, created_at")
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "hmo_claims",
    entityId: data.id,
    description: `Created claim ${claimNumber}: ₦${(totalBilled ?? 0).toLocaleString()} (${body.encounterType})`,
  });

  return ok(data, 201);
});

export const runtime = "nodejs";
