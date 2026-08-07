import { withStaff, ok, ValidationError, requireTenant, parseBody } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/pharmacy/ai/interactions  { drugIds: string[] }
// Flags dangerous combinations across the given catalogue items (curated
// generic-pair KB). Returns pairs ordered by severity.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = await parseBody<{ drugIds?: string[] }>(req);
  const drugIds = Array.isArray(body.drugIds) ? [...new Set(body.drugIds)].filter(Boolean) : [];
  if (drugIds.length < 2) throw new ValidationError("Provide at least two drug ids");

  const { data, error } = await ctx.svc.rpc("pharmacy_interaction_check", {
    p_tenant_id: tenantId,
    p_drug_ids: drugIds,
  });
  if (error) throw new ValidationError(error.message);

  return ok((data ?? []).map((r: any) => ({
    drugAId: r.drug_a_id,
    drugBId: r.drug_b_id,
    drugAName: r.drug_a_name,
    drugBName: r.drug_b_name,
    drugAGeneric: r.drug_a_generic,
    drugBGeneric: r.drug_b_generic,
    severity: r.severity,
    effect: r.effect,
    advice: r.advice,
  })));
});

export const runtime = "nodejs";