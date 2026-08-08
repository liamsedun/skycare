import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/ai/insights
// Dashboard bundle: forecast accuracy matrix, latest forecasts per drug,
// and the aggregated insights payload (coverage, stockout risks, restock).
export const GET = withStaff(async (_req, ctx) => {
  const tenantId = requireTenant(ctx);

  const [insightsRes, forecastRes, matrixRes] = await Promise.all([
    ctx.svc.rpc("pharmacy_ai_insights", { p_tenant: tenantId, p_limit: 10 }),
    ctx.svc
      .from("pharmacy_forecasts")
      .select(
        "drug_id, predicted_at, predicted_qty, on_hand, suggested_reorder, confidence, horizon, pharmacy_drugs(name)"
      )
      .eq("tenant_id", tenantId)
      .eq("horizon", 30)
      .order("predicted_at", { ascending: false })
      .limit(200),
    ctx.svc.rpc("pharmacy_forecast_matrix", {
      p_tenant: tenantId,
      p_horizon: 30,
      p_limit: 50,
    }),
  ]);
  if (insightsRes.error) throw new ValidationError(insightsRes.error.message);
  const matrixErr = matrixRes.error ? matrixRes.error.message : null;

  // Latest forecast per drug (dedupe by drug, ordered desc already).
  const seen = new Set<string>();
  const forecasts: any[] = [];
  for (const f of forecastRes.data ?? []) {
    if (seen.has(f.drug_id)) continue;
    seen.add(f.drug_id);
    forecasts.push({
      drugId: f.drug_id,
      drugName: (f.pharmacy_drugs as any)?.name ?? null,
      predictedQty: f.predicted_qty,
      onHand: f.on_hand,
      suggestedReorder: f.suggested_reorder,
      confidence: f.confidence,
      predictedAt: f.predicted_at,
    });
  }

  return ok({
    insights: insightsRes.data,
    forecasts,
    matrix: matrixErr
      ? null
      : (matrixRes.data ?? []).map((r: any) => ({
          drugName: r.drug_name,
          predictedQty: r.predicted_qty,
          actualQty: r.actual_qty,
          accuracy: r.accuracy,
          predictedAt: r.predicted_at,
        })),
    matrixError: matrixErr,
  });
});

export const runtime = "nodejs";