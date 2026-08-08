import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/analytics/profit-margins?from=YYYY-MM-DD&to=YYYY-MM-DD&branch=
// Per-drug gross profit and margin % (cost from batch cost_price, fallback
// wholesale_price) over a date window.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from")?.trim() || null;
  const to = sp.get("to")?.trim() || null;
  const branch = sp.get("branch")?.trim() || null;

  const { data, error } = await ctx.svc.rpc("pharmacy_profit_margins", {
    p_tenant: tenantId,
    p_from: from,
    p_to: to,
    p_branch: branch,
  });
  if (error) throw new ValidationError(error.message);

  return ok((data ?? []).map((r: any) => ({
    drugId: r.drug_id,
    drugName: r.drug_name,
    revenue: r.revenue,
    cost: r.cost,
    profit: r.profit,
    marginPct: r.margin_pct,
    qty: r.qty,
    avgUnitPrice: r.avg_unit_price,
  })));
});

export const runtime = "nodejs";