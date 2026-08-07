import { withStaff, ok, NotFoundError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/ai/pricing/[drugId]
// Smart price suggestion: NG retail margin band for the drug's category
// applied to wholesale / latest batch cost; reports current price vs band.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const segments = req.nextUrl.pathname.split("/");
  const drugId = segments[segments.length - 1];

  const { data, error } = await ctx.svc.rpc("pharmacy_suggest_pricing", {
    p_tenant_id: tenantId,
    p_drug_id: drugId,
  });
  if (error) throw new NotFoundError(`Pricing lookup failed: ${error.message}`);
  if (!Array.isArray(data) || data.length === 0) throw new NotFoundError("Drug not found");

  const row = data[0];
  return ok({
    wholesale: Number(row.wholesale ?? 0),
    currentPrice: Number(row.current_price ?? 0),
    marginLowPct: Number(row.margin_low_pct ?? 20),
    marginHighPct: Number(row.margin_high_pct ?? 45),
    suggestedLow: Number(row.suggested_price ?? row.suggested_low ?? 0),
    suggestedHigh: Number(row.suggested_high ?? 0),
    category: row.category,
  });
});

export const runtime = "nodejs";