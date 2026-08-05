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

// GET /api/audit-logs?entity_type=&entity_id=&user_id=&role=&action=&from=&to=&page=&pageSize=
// Admin-only (hospital_admin / super_admin). Tenant-scoped via service client
// (bypasses RLS, so the filter is mandatory — mirrors the audit_select policy).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!ADMIN_ROLES.includes(ctx.role)) {
    throw new ForbiddenError("Only admins can view audit logs");
  }

  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const entityType = resolveParam(req.nextUrl.searchParams.get("entity_type"));
  const entityId = resolveParam(req.nextUrl.searchParams.get("entity_id"));
  const userId = resolveParam(req.nextUrl.searchParams.get("user_id"));
  const role = resolveParam(req.nextUrl.searchParams.get("role"));
  const action = resolveParam(req.nextUrl.searchParams.get("action"));
  const dateFrom = resolveParam(req.nextUrl.searchParams.get("from"));
  const dateTo = resolveParam(req.nextUrl.searchParams.get("to"));

  let query = ctx.svc
    .from("audit_logs")
    .select("*, users(id, full_name, email, role)", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (entityType) query = query.eq("entity_type", entityType);
  if (entityId) query = query.eq("entity_id", entityId);
  if (userId) query = query.eq("user_id", userId);
  if (role) query = query.eq("role", role);
  if (action) query = query.eq("action", action);
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59.999Z`);

  const { data, count } = await query;
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export const runtime = "nodejs";
