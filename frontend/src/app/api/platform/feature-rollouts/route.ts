import { NextRequest } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;

  const { data, error } = await svc
    .from("feature_rollouts").select("*")
    .order("created_at", { ascending: false });

  if (error) throw new ApiError(error.message, 500);
  return ok(data || []);
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc, user } = ctx;
  const body = await req.json();
  const { feature_key, name, description, rollout_percent, is_active, allowlist_tenant_ids } = body;

  if (!feature_key || !name) throw new ApiError("Feature key and name are required", 400);

  const { data, error } = await svc.from("feature_rollouts").insert({
    feature_key,
    name,
    description: description || null,
    rollout_percent: rollout_percent || 0,
    is_active: is_active || false,
    allowlist_tenant_ids: allowlist_tenant_ids || [],
    started_at: is_active ? new Date().toISOString() : null,
    created_by: user.id,
  }).select().single();

  if (error) {
    if (error.code === "23505") throw new ApiError("Feature key already exists", 400);
    throw new ApiError(error.message, 500);
  }

  await svc.from("platform_audit_logs").insert({
    action: "CREATE", entity_type: "feature_rollouts", entity_id: data.id,
    user_id: user.id, user_email: user.email,
    description: `Created feature rollout "${name}" (${feature_key})`,
  });

  return ok(data, 201);
});

export const PUT = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc, user } = ctx;
  const body = await req.json();
  const { id, name, description, rollout_percent, is_active, allowlist_tenant_ids } = body;

  if (!id) throw new ApiError("ID required", 400);

  const { data: existing } = await svc.from("feature_rollouts").select("*").eq("id", id).single();
  if (!existing) throw new ApiError("Not found", 404);

  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  if (rollout_percent !== undefined) patch.rollout_percent = rollout_percent;
  if (allowlist_tenant_ids !== undefined) patch.allowlist_tenant_ids = allowlist_tenant_ids;

  if (is_active !== undefined && is_active !== existing.is_active) {
    patch.is_active = is_active;
    patch.started_at = is_active ? (existing.started_at || new Date().toISOString()) : existing.started_at;
    patch.ended_at = is_active ? null : new Date().toISOString();
  }

  const { data, error } = await svc.from("feature_rollouts").update(patch).eq("id", id).select().single();
  if (error) throw new ApiError(error.message, 500);

  await svc.from("platform_audit_logs").insert({
    action: "UPDATE", entity_type: "feature_rollouts", entity_id: id,
    user_id: user.id, user_email: user.email,
    description: `Updated feature rollout "${existing.name}"`,
  });

  return ok(data);
});
