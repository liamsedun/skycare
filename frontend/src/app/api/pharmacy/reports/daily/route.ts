import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/reports/daily?date=YYYY-MM-DD&branchId=
// Aggregates paid pharmacy sales by payment method + top drugs.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const date = req.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ValidationError("date must be YYYY-MM-DD");
  }
  const branchId = req.nextUrl.searchParams.get("branchId") || null;

  const { data, error } = await ctx.svc.rpc("pharmacy_daily_sales", {
    p_tenant_id: tenantId,
    p_sales_date: date,
    p_branch_id: branchId,
  });
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "view",
    entityType: "pharmacy_daily_sales",
    entityId: date,
    description: `Viewed pharmacy daily sales report for ${date}`,
  });

  return ok(data?.[0] ?? null);
});

export const runtime = "nodejs";