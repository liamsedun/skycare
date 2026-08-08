import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/analytics/top-drugs?from=YYYY-MM-DD&to=YYYY-MM-DD&branch=&limit=
// Top-selling drugs by revenue over a window, with qty + revenue share %.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from")?.trim() || null;
  const to = sp.get("to")?.trim() || null;
  const branch = sp.get("branch")?.trim() || null;
  const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "10", 10) || 10, 1), 100);

  const { data, error } = await ctx.svc.rpc("pharmacy_top_drugs", {
    p_tenant: tenantId,
    p_from: from,
    p_to: to,
    p_branch: branch,
    p_limit: limit,
  });
  if (error) throw new ValidationError(error.message);

  return ok((data ?? []).map((r: any) => ({
    drugId: r.drug_id,
    drugName: r.drug_name,
    category: r.category,
    qty: r.qty,
    revenue: r.revenue,
    share: r.share,
  })));
});

export const runtime = "nodejs";