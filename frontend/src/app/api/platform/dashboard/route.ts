import { NextRequest, NextResponse } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;

  const { data: allTenants } = await svc
    .from("tenants")
    .select("id, name, subscription_status, plan, created_at, trial_ends_at");

  const tenants = allTenants || [];
  const now = new Date();

  const statusCounts = {
    total: tenants.length,
    trial: tenants.filter((t: any) => t.subscription_status === "trial").length,
    active: tenants.filter((t: any) => t.subscription_status === "active").length,
    past_due: tenants.filter((t: any) => t.subscription_status === "past_due").length,
    suspended: tenants.filter((t: any) => t.subscription_status === "suspended").length,
    cancelled: tenants.filter((t: any) => t.subscription_status === "cancelled").length,
  };

  const planCounts = {
    basic: tenants.filter((t: any) => t.plan === "basic").length,
    pro: tenants.filter((t: any) => t.plan === "pro").length,
    enterprise: tenants.filter((t: any) => t.plan === "enterprise").length,
    custom: tenants.filter((t: any) => t.plan === "custom").length,
  };

  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const trialsExpiring = tenants.filter((t: any) => {
    if (t.subscription_status !== "trial" || !t.trial_ends_at) return false;
    const end = new Date(t.trial_ends_at);
    return end >= now && end <= sevenDays;
  }).length;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const newThisMonth = tenants.filter(
    (t: any) => new Date(t.created_at) >= monthStart
  ).length;

  const { data: invoices } = await svc
    .from("subscription_invoices")
    .select("amount, discount_amount, status, period_start, created_at");

  const invoiceList = invoices || [];
  const totalRevenue = invoiceList
    .filter((i: any) => i.status === "completed")
    .reduce((sum: number, i: any) => sum + Number(i.amount) - Number(i.discount_amount || 0), 0);

  const totalOutstanding = invoiceList
    .filter((i: any) => i.status === "pending")
    .reduce((sum: number, i: any) => sum + Number(i.amount) - Number(i.discount_amount || 0), 0);

  const mrr = invoiceList
    .filter((i: any) => {
      if (i.status !== "completed") return false;
      const d = new Date(i.period_start);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum: number, i: any) => sum + Number(i.amount) - Number(i.discount_amount || 0), 0);

  const monthlyTrend = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = d.toISOString().slice(0, 7);
    const monthLabel = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    const monthRevenue = invoiceList
      .filter((inv: any) => {
        if (inv.status !== "completed") return false;
        const pd = new Date(inv.period_start);
        return pd.getMonth() === d.getMonth() && pd.getFullYear() === d.getFullYear();
      })
      .reduce((sum: number, inv: any) => sum + Number(inv.amount) - Number(inv.discount_amount || 0), 0);

    monthlyTrend.push({ month, label: monthLabel, revenue: monthRevenue });
  }

  const recentTenants = tenants
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map((t: any) => ({
      id: t.id,
      name: t.name || t.id,
      subscription_status: t.subscription_status,
      plan: t.plan,
      created_at: t.created_at,
    }));

  const { data: coupons } = await svc
    .from("platform_coupons")
    .select("id, code, used_count, is_active, max_uses");

  const couponList = coupons || [];
  const activeCoupons = couponList.filter((c: any) => c.is_active).length;
  const totalCouponUses = couponList.reduce((sum: number, c: any) => sum + (c.used_count || 0), 0);

  const trialTenants = tenants.filter((t: any) => t.subscription_status === "trial").length;
  const activeFromTrial = tenants.filter(
    (t: any) => t.subscription_status === "active" && t.trial_ends_at
  ).length;
  const conversionRate =
    trialTenants + activeFromTrial > 0
      ? Math.round((activeFromTrial / (trialTenants + activeFromTrial)) * 100)
      : 0;

  return ok({
    statusCounts,
    planCounts,
    trialsExpiring,
    newThisMonth,
    totalRevenue,
    totalOutstanding,
    mrr,
    monthlyTrend,
    recentTenants,
    activeCoupons,
    totalCouponUses,
    conversionRate,
  });
});
