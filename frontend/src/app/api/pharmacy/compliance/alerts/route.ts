import { withStaff, ok, okPaginated, ValidationError, requireTenant } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ALERT_SELECT =
  "id, alert_type, severity, drug_id, title, message, status, resolved_by, resolved_at, created_at, pharmacy_drugs(name, control_schedule, nafdac_number)";

// GET /api/pharmacy/compliance/alerts?alertType=&severity=&status=&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const alertType = resolveParam(req.nextUrl.searchParams.get("alertType"));
  const severity = resolveParam(req.nextUrl.searchParams.get("severity"));
  const status = resolveParam(req.nextUrl.searchParams.get("status"));

  let query = ctx.svc
    .from("pharmacy_compliance_alerts")
    .select(ALERT_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (alertType) query = query.eq("alert_type", alertType);
  if (severity) query = query.eq("severity", severity);
  if (status) query = query.eq("status", status);

  const { data, count, error } = await query;
  if (error) throw new ValidationError(error.message);
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

interface ResolveAlertBody {
  id: string;
  status: "acknowledged" | "resolved";
}

// PATCH /api/pharmacy/compliance/alerts — acknowledge or resolve an alert.
export const PATCH = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as ResolveAlertBody;
  if (!body.id || !["acknowledged", "resolved"].includes(body.status)) {
    throw new ValidationError("id and status (acknowledged|resolved) are required");
  }

  const { data, error } = await ctx.svc
    .from("pharmacy_compliance_alerts")
    .update({
      status: body.status,
      resolved_by: body.status === "resolved" ? ctx.user.id : null,
      resolved_at: body.status === "resolved" ? new Date().toISOString() : null,
    })
    .eq("id", body.id)
    .eq("tenant_id", tenantId)
    .select("id, alert_type, title, status")
    .single();
  if (error || !data) throw new ValidationError(error?.message ?? "Alert not found");

  await logAudit(req, ctx, {
    action: "update",
    entityType: "pharmacy_compliance_alerts",
    entityId: data.id,
    description: `${data.alert_type} alert "${data.title}" ${body.status}`,
  });
  return ok(data);
});

export const runtime = "nodejs";