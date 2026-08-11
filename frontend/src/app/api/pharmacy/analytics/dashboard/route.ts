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

  // Today's supplier-side figures: drugs received today (GRN cost), supplier
  // payments made today, and the resulting outstanding balance.
  const now = new Date();
  const todayDate = now.toISOString().slice(0, 10);
  const todayStart = `${todayDate}T00:00:00`;

  const { data: grns } = await ctx.svc
    .from("pharmacy_goods_received_notes")
    .select("id")
    .eq("tenant_id", tenantId)
    .gte("received_at", todayStart);
  const grnIds = (grns ?? []).map((g) => g.id);

  let purchased = 0;
  if (grnIds.length > 0) {
    const { data: items } = await ctx.svc
      .from("pharmacy_grn_items")
      .select("quantity_received, unit_cost")
      .in("grn_id", grnIds);
    purchased = (items ?? []).reduce(
      (acc, i) => acc + Number(i.quantity_received ?? 0) * Number(i.unit_cost ?? 0),
      0
    );
  }

  const { data: pays } = await ctx.svc
    .from("supplier_payments")
    .select("amount")
    .eq("tenant_id", tenantId)
    .eq("paid_at", todayDate);
  const paid = (pays ?? []).reduce((acc, p) => acc + Number(p.amount ?? 0), 0);

  const vendorToday = {
    purchased: Math.round(purchased * 100) / 100,
    paid: Math.round(paid * 100) / 100,
    outstanding: Math.round((purchased - paid) * 100) / 100,
  };

  return ok({ ...data, vendor_today: vendorToday });
});

export const runtime = "nodejs";