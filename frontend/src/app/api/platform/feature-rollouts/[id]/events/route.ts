import { NextRequest } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  // rollout id is second-to-last segment
  const segs = req.url.split("/").filter(Boolean);
  const rolloutId = segs[segs.length - 2];

  const { data, error } = await svc
    .from("feature_rollout_events").select("*").eq("rollout_id", rolloutId)
    .order("created_at", { ascending: false }).limit(100);

  if (error) throw new ApiError(error.message, 500);
  return ok(data || []);
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc, user } = ctx;
  const segs = req.url.split("/").filter(Boolean);
  const rolloutId = segs[segs.length - 2];
  const body = await req.json();
  const { event, tenant_id, metadata } = body;

  if (!event || !tenant_id) throw new ApiError("Event and tenant_id required", 400);

  const { data, error } = await svc.from("feature_rollout_events").insert({
    rollout_id: rolloutId,
    tenant_id,
    user_id: user.id,
    event,
    metadata: metadata || {},
  }).select().single();

  if (error) throw new ApiError(error.message, 500);
  return ok(data, 201);
});
