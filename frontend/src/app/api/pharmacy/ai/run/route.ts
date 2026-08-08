import { withStaff, ok, ValidationError, requireTenant, parseBody } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/pharmacy/ai/run  { days?, createPurchaseOrders? }
// Full AI sweep: (1) demand forecast, (2) anomaly scan, (3) auto reorder
// recommendations. With createPurchaseOrders=true the reorder engine creates
// draft POs for forecasted shortfalls.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = await parseBody<{ days?: number; createPurchaseOrders?: boolean }>(req);
  const days = body.days && Number.isInteger(body.days) ? body.days : 7;
  const createPOs = body.createPurchaseOrders === true;

  const forecastRes = await ctx.svc.rpc("pharmacy_forecast_run", {
    p_tenant: tenantId,
    p_drug: null,
  });
  const anomalyRes = await ctx.svc.rpc("pharmacy_anomaly_scan", {
    p_tenant: tenantId,
    p_days: days,
  });
  const runRes = await ctx.svc.rpc("pharmacy_auto_reorder", {
    p_tenant: tenantId,
    p_dry_run: !createPOs,
    p_created_by: ctx.user.id,
  });

  if (forecastRes.error) throw new ValidationError(forecastRes.error.message);
  if (anomalyRes.error) throw new ValidationError(anomalyRes.error.message);
  if (runRes.error) throw new ValidationError(runRes.error.message);

  return ok({
    forecasts: (forecastRes.data ?? []).map((r: any) => ({
      drugId: r.drug_id,
      drugName: r.drug_name,
      predicted30d: r.predicted_30d,
      predicted90d: r.predicted_90d,
      confidence: r.confidence,
      onHand: r.on_hand,
      stockoutDays: r.stockout_days,
      suggestedReorder: r.suggested_reorder,
      skipped: r.skipped,
      reason: r.reason,
    })),
    anomalies: (anomalyRes.data ?? []).map((r: any) => ({
      anomalyType: r.anomaly_type,
      severity: r.severity,
      drugId: r.drug_id,
      description: r.description,
    })),
    reorder: (runRes.data ?? []).map((r: any) => ({
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      drugId: r.drug_id,
      drugName: r.drug_name,
      quantity: r.quantity,
      unitCost: r.unit_cost,
      lineTotal: r.line_total,
      poId: r.po_id,
      note: r.note,
    })),
    createdPurchaseOrders: createPOs,
  });
});

export const runtime = "nodejs";