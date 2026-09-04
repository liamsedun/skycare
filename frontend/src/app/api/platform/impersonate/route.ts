import { NextRequest } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";
import crypto from "crypto";

export const runtime = "nodejs";

// Start impersonation — create a 5-minute session
export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc, user } = ctx;
  const body = await req.json();
  const { tenant_id } = body;

  if (!tenant_id) throw new ApiError("tenant_id required", 400);

  // Verify tenant exists
  const { data: tenant, error: tErr } = await svc.from("tenants").select("id, name").eq("id", tenant_id).single();
  if (tErr || !tenant) throw new ApiError("Tenant not found", 404);

  // Check for active impersonation already running
  const { data: existing } = await svc
    .from("impersonation_sessions")
    .select("id")
    .eq("super_admin_id", user.id)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .single();

  if (existing) throw new ApiError("You already have an active impersonation session. Stop it first.", 400);

  // Create session record
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const { data: session, error: sErr } = await svc.from("impersonation_sessions").insert({
    super_admin_id: user.id,
    super_admin_email: user.email,
    tenant_id,
    tenant_name: tenant.name,
    expires_at: expiresAt,
    ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
    user_agent: req.headers.get("user-agent") || "unknown",
    status: "active",
  }).select().single();

  if (sErr) throw new ApiError(sErr.message, 500);

  // Audit
  await svc.from("platform_audit_logs").insert({
    action: "IMPERSONATE_START", entity_type: "impersonation_sessions", entity_id: session.id,
    user_id: user.id, user_email: user.email,
    description: `Started impersonation of tenant "${tenant.name}" (${tenant_id})`,
  });

  // Generate a time-limited impersonation token (random 32-byte hex, 5min expiry marker)
  const token = crypto.randomBytes(32).toString("hex");

  return ok({
    session_id: session.id,
    tenant_id,
    tenant_name: tenant.name,
    token,
    expires_at: expiresAt,
    expiresIn: "5m",
  });
});

// List active impersonation sessions (platform admin)
export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;

  // Auto-expire old sessions
  await svc.from("impersonation_sessions")
    .update({ status: "expired" })
    .eq("status", "active")
    .lt("expires_at", new Date().toISOString());

  const { data, error } = await svc
    .from("impersonation_sessions")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) throw new ApiError(error.message, 500);
  return ok(data || []);
});
