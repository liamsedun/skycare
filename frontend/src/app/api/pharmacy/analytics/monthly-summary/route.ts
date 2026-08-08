import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/analytics/monthly-summary?months=6&branch=
// Month-by-month revenue/cost/profit, invoice counts, units sold and the
// payment-method split (cash/pos/transfer/card/insurance + refunds).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const sp = req.nextUrl.searchParams;
  const months = Math.min(Math.max(parseInt(sp.get("months") ?? "6", 10) || 6, 1), 36);
  const branch = sp.get("branch")?.trim() || null;

  const { data, error } = await ctx.svc.rpc("pharmacy_monthly_financials", {
    p_tenant_id: tenantId,
    p_months: months,
    p_branch: branch,
  });
  if (error) throw new ValidationError(error.message);

  return ok((data ?? []).map((r: any) => ({
    month: r.month,
    revenue: r.revenue,
    cost: r.cost,
    profit: r.profit,
    invoiceCount: r.invoice_count,
    itemsSold: r.items_sold,
    cash: r.cash,
    pos: r.pos,
    transfer: r.transfer,
    card: r.card,
    insurance: r.insurance,
    refunds: r.refunds,
  })));
});

export const runtime = "nodejs";