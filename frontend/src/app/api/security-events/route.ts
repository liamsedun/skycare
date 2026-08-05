import {
  withStaff,
  okPaginated,
  ForbiddenError,
  requireTenant,
  getPagination,
  resolveParam,
} from "@/lib/api-utils";
import { ADMIN_ROLES } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/security-events?event_type=&severity=&user_id=&from=&to=&page=&pageSize=
// Admin-only (hospital_admin / super_admin). Tenant events plus global
// failed-login events (tenant_id IS NULL) — mirrors the
// security_events_admin_read RLS policy via the service client.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!ADMIN_ROLES.includes(ctx.role)) {
    throw new ForbiddenError("Only admins can view security events");
  }

  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const eventType = resolveParam(req.nextUrl.searchParams.get("event_type"));
  const severity = resolveParam(req.nextUrl.searchParams.get("severity"));
  const userId = resolveParam(req.nextUrl.searchParams.get("user_id"));
  const dateFrom = resolveParam(req.nextUrl.searchParams.get("from"));
  const dateTo = resolveParam(req.nextUrl.searchParams.get("to"));

  let query = ctx.svc
    .from("security_events")
    .select("*, users(id, full_name, email, role)", { count: "exact" })
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (eventType) query = query.eq("event_type", eventType);
  if (severity) query = query.eq("severity", severity);
  if (userId) query = query.eq("user_id", userId);
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59.999Z`);

  const { data, count } = await query;
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export const runtime = "nodejs";
