import { withAuth, ok, ForbiddenError } from "@/lib/api-utils";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  if (ctx.role !== "hospital_admin") {
    throw new ForbiddenError("Admin access required");
  }

  const svc = createServiceClient();
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [failedLogins24h, securityEvents24h, securityEvents7d, recentEvents] = await Promise.all([
    svc.from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "failed_login")
      .gte("created_at", last24h),
    svc.from("security_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", last24h),
    svc.from("security_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", last7d),
    svc.from("security_events")
      .select("id, event_type, severity, description, ip_address, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const events = (recentEvents.data ?? []) as Array<{
    id: string;
    event_type: string;
    severity: string;
    description: string;
    ip_address: string | null;
    created_at: string;
  }>;

  const topIpMap = new Map<string, number>();
  for (const e of events) {
    if (e.ip_address) {
      topIpMap.set(e.ip_address, (topIpMap.get(e.ip_address) ?? 0) + 1);
    }
  }
  const topIps = [...topIpMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ip, count]) => ({ ip, count }));

  return ok({
    failedLogins24h: failedLogins24h.count ?? 0,
    totalEvents24h: securityEvents24h.count ?? 0,
    totalEvents7d: securityEvents7d.count ?? 0,
    topIps,
    recentEvents: events.slice(0, 20),
  });
});

export const runtime = "nodejs";
