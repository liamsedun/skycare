import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { AuthedContext } from "@/lib/api-utils";

// ============================================================================
// AUDIT — API-layer logging for service-client writes + view tracking.
// DB triggers log RLS-scoped writes; service-role writes are logged HERE so
// nothing is double-logged (the triggers skip when auth.uid() IS NULL).
// ============================================================================

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "view"
  | "login"
  | "logout"
  | "login_failed"
  | "export"
  | "permission_denied";

export function getClientMeta(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  return { ip_address: ip, user_agent: req.headers.get("user-agent") };
}

export interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  description?: string | null;
  changes?: Record<string, unknown> | null;
}

/** Best-effort audit write; never throws (auditing must not break the request). */
export async function logAudit(
  req: NextRequest,
  ctx: AuthedContext,
  entry: AuditEntry
): Promise<void> {
  try {
    const svc = createServiceClient();
    const { ip_address, user_agent } = getClientMeta(req);
    await svc.from("audit_logs").insert({
      tenant_id: ctx.tenantId,
      user_id: ctx.user.id,
      role: ctx.role,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      changes: entry.changes ?? null,
      description: entry.description ?? null,
      ip_address,
      user_agent,
    });
  } catch {
    /* ignore */
  }
}

/** View tracking with rapid-view anomaly detection (>8 same-entity views in 5 min). */
export async function logView(
  req: NextRequest,
  ctx: AuthedContext,
  entityType: string,
  entityId: string,
  description?: string
): Promise<void> {
  await logAudit(req, ctx, {
    action: "view",
    entityType,
    entityId,
    description: description ?? null,
  });
  try {
    const svc = createServiceClient();
    const window = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count } = await svc
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.user.id)
      .eq("action", "view")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .gte("created_at", window);
    if ((count ?? 0) > 8) {
      const { ip_address, user_agent } = getClientMeta(req);
      await svc.from("security_events").insert({
        tenant_id: ctx.tenantId,
        user_id: ctx.user.id,
        event_type: "rapid_view",
        severity: "high",
        description: `Rapid repeated views of ${entityType}:${entityId}`,
        ip_address,
        user_agent,
        metadata: { entity_type: entityType, entity_id: entityId, views: count },
      });
    }
  } catch {
    /* ignore */
  }
}

export async function flagSecurityEvent(
  req: NextRequest,
  ctx: Pick<AuthedContext, "tenantId" | "user"> | null,
  eventType: string,
  severity: "info" | "warning" | "high" | "critical",
  description: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const svc = createServiceClient();
    const { ip_address, user_agent } = getClientMeta(req);
    await svc.from("security_events").insert({
      tenant_id: ctx?.tenantId ?? null,
      user_id: ctx?.user.id ?? null,
      event_type: eventType,
      severity,
      description,
      ip_address,
      user_agent,
      metadata: metadata ?? null,
    });
  } catch {
    /* ignore */
  }
}

/** True when >=5 failed logins for the same identifier+IP in the last 15 minutes. */
export async function checkLoginLockout(req: NextRequest, identifier: string): Promise<boolean> {
  try {
    const svc = createServiceClient();
    const { ip_address } = getClientMeta(req);
    const window = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await svc
      .from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "failed_login")
      .eq("description", `Failed login for ${identifier}`)
      .eq("ip_address", ip_address ?? "")
      .gte("created_at", window);
    return (count ?? 0) >= 5;
  } catch {
    return false;
  }
}

export async function recordLoginFailure(
  req: NextRequest,
  identifier: string,
  reason: string
): Promise<void> {
  await flagSecurityEvent(
    req,
    null,
    "failed_login",
    "warning",
    `Failed login for ${identifier} — ${reason}`,
    { identifier }
  );
}

export async function logAuth(
  req: NextRequest,
  user: { id: string; tenantId: string | null; role: string },
  action: "login" | "logout"
): Promise<void> {
  try {
    const svc = createServiceClient();
    const { ip_address, user_agent } = getClientMeta(req);
    await svc.from("audit_logs").insert({
      tenant_id: user.tenantId,
      user_id: user.id,
      role: user.role,
      action,
      entity_type: "auth",
      entity_id: null,
      changes: null,
      description: action === "login" ? "Signed in" : "Signed out",
      ip_address,
      user_agent,
    });
  } catch {
    /* ignore */
  }
}
