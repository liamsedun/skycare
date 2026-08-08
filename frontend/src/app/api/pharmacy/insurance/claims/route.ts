import { withStaff, ok, okPaginated, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const CLAIM_SELECT =
  "id, invoice_id, patient_id, provider_name, policy_number, claim_number, claim_amount, co_pay_amount, approved_amount, status, submitted_at, processed_at, processed_by, notes, created_by, created_at, pharmacy_invoices(invoice_number, total_amount, patients(first_name, last_name, patient_number))";

// GET /api/pharmacy/insurance/claims?status=&provider=&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const status = resolveParam(req.nextUrl.searchParams.get("status"));
  const provider = resolveParam(req.nextUrl.searchParams.get("provider"));

  let query = ctx.svc
    .from("insurance_claims")
    .select(CLAIM_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);
  if (provider) query = query.eq("provider_name", provider);

  const { data, count, error } = await query;
  if (error) throw new ValidationError(error.message);
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export interface CreateClaimBody {
  invoiceId: string;
  providerName: string;
  policyNumber?: string;
  mode: "auto" | "manual";
  notes?: string;
}

// POST /api/pharmacy/insurance/claims — auto: compute from formulary;
// manual: draft for review. Duplicate claims for invoice+provider are blocked.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as CreateClaimBody;

  if (!body.invoiceId || !body.providerName?.trim()) {
    throw new ValidationError("invoiceId and providerName are required");
  }
  if (!["auto", "manual"].includes(body.mode)) {
    throw new ValidationError("mode must be auto or manual");
  }

  const { data: claimId, error } = await ctx.svc.rpc("pharmacy_claim_create", {
    p_tenant_id: tenantId,
    p_invoice_id: body.invoiceId,
    p_provider_name: body.providerName.trim(),
    p_policy_number: body.policyNumber?.trim() || null,
    p_created_by: ctx.user.id,
    p_claim_mode: body.mode,
  });
  if (error) throw new ValidationError(error.message);

  const { data: claim, error: fetchError } = await ctx.svc
    .from("insurance_claims")
    .select("id, claim_number, claim_amount, co_pay_amount, status")
    .eq("id", claimId)
    .single();
  if (fetchError || !claim) throw new ValidationError(fetchError?.message ?? "Claim not found");

  await logAudit(req, ctx, {
    action: "create",
    entityType: "insurance_claims",
    entityId: claim.id,
    description: `Claim ${claim.claim_number} (${body.providerName}) for ₦${claim.claim_amount} created (${body.mode})`,
  });

  return ok(claim, 201);
});

export const runtime = "nodejs";