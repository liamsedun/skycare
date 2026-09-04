import { NextRequest } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;

  // Parallel queries for KPIs
  const [tenantsRes, usersRes, invoicesRes, ticketsRes, rolloutsRes] = await Promise.all([
    svc.from("tenants").select("id, subscription_status, tenant_plan, created_at"),
    svc.from("users").select("id, is_active, role, created_at").neq("role", "patient_api"),
    svc.from("subscription_invoices").select("id, total_amount, status, period_start, created_at"),
    svc.from("support_tickets").select("id, status"),
    svc.from("feature_rollouts").select("id, feature_key, name, is_active, rollout_percent"),
  ]);

  const tenants = tenantsRes.data || [];
  const users = usersRes.data || [];
  const invoices = invoicesRes.data || [];
  const tickets = ticketsRes.data || [];
  const rollouts = rolloutsRes.data || [];

  // Tenant KPIs
  const totalTenants = tenants.length;
  const activeTenants = tenants.filter(t => t.subscription_status === "active").length;
  const trialTenants = tenants.filter(t => t.subscription_status === "trial").length;
  const cancelledTenants = tenants.filter(t => t.subscription_status === "cancelled").length;
  const suspendedTenants = tenants.filter(t => t.subscription_status === "suspended").length;

  // Revenue KPIs (Naira)
  const paidInvoices = invoices.filter(i => i.status === "completed" || i.status === "paid");
  const totalRevenue = paidInvoices.reduce((s, i) => s + (Number(i.total_amount) || 0), 0);
  const now = new Date();
  const thisMonth = invoices.filter(i => {
    const d = new Date(i.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && (i.status === "completed" || i.status === "paid");
  });
  const mrr = thisMonth.reduce((s, i) => s + (Number(i.total_amount) || 0), 0);
  const arr = mrr * 12;

  // User KPIs
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.is_active).length;

  // Ticket stats
  const ticketStats = {
    open: tickets.filter(t => t.status === "open").length,
    in_progress: tickets.filter(t => t.status === "in_progress").length,
    resolved: tickets.filter(t => t.status === "resolved").length,
    closed: tickets.filter(t => t.status === "closed").length,
  };

  // Plan distribution
  const planMap: Record<string, { count: number; revenue: number }> = {};
  for (const t of tenants) {
    const plan = t.tenant_plan || "basic";
    if (!planMap[plan]) planMap[plan] = { count: 0, revenue: 0 };
    planMap[plan].count++;
  }
  for (const inv of paidInvoices) {
    // Approximate: spread revenue across plans by tenant
  }
  const planDistribution = Object.entries(planMap).map(([planName, v]) => ({
    planName, count: v.count, revenue: v.revenue,
  }));

  // Revenue over time (last 6 months)
  const revenueOverTime: Array<{ month: string; revenue: number; subscriptions: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    const monthInvoices = paidInvoices.filter(inv => {
      const id = new Date(inv.created_at);
      return id.getMonth() === d.getMonth() && id.getFullYear() === d.getFullYear();
    });
    revenueOverTime.push({
      month: monthStr,
      revenue: monthInvoices.reduce((s, inv) => s + (Number(inv.total_amount) || 0), 0),
      subscriptions: monthInvoices.length,
    });
  }

  // Org growth (last 12 months)
  const orgGrowth: Array<{ month: string; newOrgs: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    const newOrgs = tenants.filter(t => {
      const td = new Date(t.created_at);
      return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
    }).length;
    orgGrowth.push({ month: monthStr, newOrgs });
  }

  // Recent tenants
  const recentTenants = tenants
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map(t => ({ id: t.id, name: t.id.slice(0, 8) + "…", status: t.subscription_status }));

  // Feature usage
  const featureUsage = rollouts.map(r => ({
    featureKey: r.feature_key,
    name: r.name,
    isActive: r.is_active,
    rolloutPercent: r.rollout_percent,
  }));

  // System health (basic)
  const serverStatus = {
    uptime: process.uptime(),
    memoryUsed: process.memoryUsage().heapUsed,
    memoryTotal: process.memoryUsage().heapTotal,
    nodeVersion: process.version,
  };

  return ok({
    kpis: {
      totalTenants, activeTenants, trialTenants, cancelledTenants, suspendedTenants,
      mrr, arr, totalRevenue, totalUsers, activeUsers,
      openTickets: ticketStats.open,
      totalTickets: tickets.length,
    },
    revenueOverTime,
    planDistribution,
    orgGrowth,
    recentTenants,
    ticketStats,
    featureUsage,
    serverStatus,
  });
});
