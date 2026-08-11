import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/analytics/dashboard?months=12&branch=<id?>&from=YYYY-MM-DD&to=YYYY-MM-DD?
// Single-call executive dashboard: KPIs, top-selling drugs, 12-month
// revenue/cost/profit series, payment-method split and wastage (loss) since
// the current month. Driven by pharmacy_analytics_dashboard().
// When both from & to are provided, the whole report drills into that custom
// period (monthly series bucketed by calendar month of the window).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const sp = req.nextUrl.searchParams;
  const months = Math.min(Math.max(parseInt(sp.get("months") ?? "12", 10) || 12, 1), 36);
  const branch = sp.get("branch")?.trim() || null;
  const from = sp.get("from")?.trim() || null;
  const to = sp.get("to")?.trim() || null;

  if (from && to && from > to) {
    throw new ValidationError("from must be on or before to");
  }

  const { data, error } = await ctx.svc.rpc("pharmacy_analytics_dashboard", {
    p_tenant_id: tenantId,
    p_months: months,
    p_branch: branch,
    p_from: from,
    p_to: to,
  });
  if (error) throw new ValidationError(error.message);

  return ok(data ?? null);
});

export const runtime = "nodejs";