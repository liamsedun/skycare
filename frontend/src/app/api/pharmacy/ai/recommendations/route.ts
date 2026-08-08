import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/pharmacy/ai/recommendations
// Runs the auto-reorder engine in DRY-RUN mode: suggests PO line items per
// supplier (best price/lead-time) from the latest 30d forecasts. Never writes.
// Pass { dryRun: false, create: true } to actually generate purchase orders.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun !== false;

  const { data, error } = await ctx.svc.rpc("pharmacy_auto_reorder", {
    p_tenant: tenantId,
    p_dry_run: dryRun,
    p_created_by: ctx.user.id,
  });
  if (error) throw new ValidationError(error.message);

  return ok((data ?? []).map((r: any) => ({
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    drugId: r.drug_id,
    drugName: r.drug_name,
    quantity: r.quantity,
    unitCost: r.unit_cost,
    lineTotal: r.line_total,
    poId: r.po_id,
    note: r.note,
  })));
});

export const runtime = "nodejs";