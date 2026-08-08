import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/analytics/wastage?from=YYYY-MM-DD&to=YYYY-MM-DD&branch=
// Stock write-offs (expired/damaged/theft/other) with qty and NGN cost impact
// per incident, from the inventory_losses ledger written by record_loss.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from")?.trim() || null;
  const to = sp.get("to")?.trim() || null;
  const branch = sp.get("branch")?.trim() || null;

  const { data, error } = await ctx.svc.rpc("pharmacy_wastage_report", {
    p_tenant_id: tenantId,
    p_from: from,
    p_to: to,
    p_branch: branch,
  });
  if (error) throw new ValidationError(error.message);

  return ok((data ?? []).map((r: any) => ({
    drugId: r.drug_id,
    drugName: r.drug_name,
    batchId: r.batch_id,
    reason: r.reason,
    qty: r.qty,
    costImpact: r.cost_impact,
    recordedAt: r.recorded_at,
    recordedBy: r.recorded_by,
  })));
});

export const runtime = "nodejs";