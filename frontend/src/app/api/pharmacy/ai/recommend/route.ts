import { withStaff, ok, ValidationError, requireTenant, parseBody } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/pharmacy/ai/recommend  { diagnosis }
// Suggests medications for a diagnosis: category rule match + tenant
// co-prescription history + live stock (pharmacy_recommend_drugs).
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = await parseBody<{ diagnosis?: string }>(req);
  const diagnosis = body.diagnosis?.trim();
  if (!diagnosis) throw new ValidationError("diagnosis is required");

  const { data, error } = await ctx.svc.rpc("pharmacy_recommend_drugs", {
    p_tenant_id: tenantId,
    p_diagnosis: diagnosis,
  });
  if (error) throw new ValidationError(error.message);

  return ok((data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    form: r.form,
    dosage: r.dosage,
    unitPrice: r.unit_price,
    genericName: r.generic_name,
    stockQty: r.stock_qty,
    prescCount: r.presc_count,
    score: r.score,
  })));
});

export const runtime = "nodejs";