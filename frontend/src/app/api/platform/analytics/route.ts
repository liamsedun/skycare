import { NextRequest, NextResponse } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const sp = req.nextUrl.searchParams;
  const period = sp.get("period") || "12months";
  const now = new Date();

  let startDate: Date;
  if (period === "30days") {
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (period === "6months") {
    startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  }

  // Revenue by month
  const { data: invoices } = await svc
    .from("subscription_invoices")
    .select("amount, discount_amount, status, period_start, tenant_id, coupon_id");

  const invoiceList = (invoices || []).filter(
    (i: any) => new Date(i.period_start) >= startDate
  );

  const monthlyRevenue: Record<string, { revenue: number; count: number }> = {};
  for (const inv of invoiceList) {
    if (inv.status !== "completed") continue;
    const month = new Date(inv.period_start).toISOString().slice(0, 7);
    if (!monthlyRevenue[month]) monthlyRevenue[month] = { revenue: 0, count: 0 };
    monthlyRevenue[month].revenue += Number(inv.amount) - Number(inv.discount_amount || 0);
    monthlyRevenue[month].count += 1;
  }

  // Revenue by plan
  const { data: tenants } = await svc.from("tenants").select("id, plan");
  const tenantMap = new Map((tenants || []).map((t: any) => [t.id, t.plan]));

  const revenueByPlan: Record<string, number> = {};
  for (const inv of invoiceList) {
    if (inv.status !== "completed") continue;
    const plan = tenantMap.get(inv.tenant_id) || "unknown";
    revenueByPlan[plan] = (revenueByPlan[plan] || 0) + Number(inv.amount) - Number(inv.discount_amount || 0);
  }

  // Churn (cancelled in period)
  const { data: allTenants } = await svc
    .from("tenants")
    .select("subscription_status, created_at");

  const tenantList = allTenants || [];
  const cancelled = tenantList.filter(
    (t: any) => t.subscription_status === "cancelled"
  ).length;
  const total = tenantList.length;
  const churnRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;

  // Coupon impact
  const { data: usage } = await svc
    .from("platform_coupon_usage")
    .select("discount_amount, coupon_id, used_at, coupon:platform_coupons(code, discount_type)");

  const usageList = (usage || []).filter(
    (u: any) => new Date(u.used_at) >= startDate
  );

  const couponImpact = usageList.reduce(
    (sum: number, u: any) => sum + Number(u.discount_amount || 0),
    0
  );

  return ok({
    monthlyRevenue: Object.entries(monthlyRevenue)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    revenueByPlan,
    churnRate,
    cancelledCount: cancelled,
    totalTenants: total,
    couponImpact,
    couponUsageCount: usageList.length,
  });
});
