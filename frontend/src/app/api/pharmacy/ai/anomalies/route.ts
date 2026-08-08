import { withStaff, ok, ValidationError, requireTenant, parseBody } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/pharmacy/ai/anomalies  { days? }
// Runs the anomaly engine: dispensing spikes, billing price outliers,
// duplicate/frequency claim anomalies. Raises compliance alerts + AI logs.
// Returns the fired anomalies for this run.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = await parseBody<{ days?: number }>(req);
  const days = body.days && Number.isInteger(body.days) ? body.days : 7;

  const { data, error } = await ctx.svc.rpc("pharmacy_anomaly_scan", {
    p_tenant: tenantId,
    p_days: days,
  });
  if (error) throw new ValidationError(error.message);

  return ok((data ?? []).map((r: any) => ({
    anomalyType: r.anomaly_type,
    severity: r.severity,
    drugId: r.drug_id,
    patientId: r.patient_id,
    entityId: r.entity_id,
    description: r.description,
  })));
});

export const runtime = "nodejs";