import { withStaff, ok, ValidationError, requireTenant, parseBody } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/pharmacy/ai/forecast  { drugId? }
// Runs the demand forecast engine (seasonal-EMA). Returns every modelled
// drug with its 30d/90d predictions, confidence, on-hand and reorder advice.
// Skipped drugs (insufficient history) come back with skipped=true + reason.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = await parseBody<{ drugId?: string }>(req);
  const drugId = body.drugId?.trim() || null;

  const { data, error } = await ctx.svc.rpc("pharmacy_forecast_run", {
    p_tenant: tenantId,
    p_drug: drugId,
  });
  if (error) throw new ValidationError(error.message);

  return ok((data ?? []).map((r: any) => ({
    drugId: r.drug_id,
    drugName: r.drug_name,
    dailyRate: r.daily_rate,
    trendFactor: r.trend_factor,
    seasonalFactor: r.seasonal_factor,
    predicted30d: r.predicted_30d,
    predicted90d: r.predicted_90d,
    confidence: r.confidence,
    sampleDays: r.sample_days,
    onHand: r.on_hand,
    stockoutDays: r.stockout_days,
    suggestedReorder: r.suggested_reorder,
    leadTimeDays: r.lead_time_days,
    skipped: r.skipped,
    reason: r.reason,
  })));
});

export const runtime = "nodejs";