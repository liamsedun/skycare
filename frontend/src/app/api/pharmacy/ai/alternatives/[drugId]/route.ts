import { withStaff, ok, NotFoundError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/ai/alternatives/[drugId]
// Same-category, same-form substitutions when the requested drug is out of
// stock — generic-family first, then in-stock, then price proximity.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const segments = req.nextUrl.pathname.split("/");
  const drugId = segments[segments.length - 1];

  const { data, error } = await ctx.svc.rpc("pharmacy_alternatives", {
    p_tenant_id: tenantId,
    p_drug_id: drugId,
  });
  if (error) throw new NotFoundError(`Alternatives lookup failed: ${error.message}`);

  return ok((data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    genericName: r.generic_name,
    form: r.form,
    dosage: r.dosage,
    unitPrice: r.unit_price,
    stockQty: r.stock_qty,
    sameGeneric: r.same_generic,
    inStock: r.in_stock,
    score: r.score,
  })));
});

export const runtime = "nodejs";