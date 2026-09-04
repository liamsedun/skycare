import { NextRequest } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc, user } = ctx;

  const { data: userData, error } = await svc
    .from("users")
    .select("id, email, full_name, role, avatar_url, is_active, preferences, last_login_at, created_at")
    .eq("id", user.id)
    .single();

  if (error || !userData) throw new ApiError("Profile not found", 404);

  return ok({
    id: userData.id,
    email: userData.email,
    fullName: userData.full_name,
    role: userData.role,
    isActive: userData.is_active,
    avatarUrl: userData.avatar_url,
    preferences: userData.preferences || {},
    lastLogin: userData.last_login_at,
    createdAt: userData.created_at,
  });
});

export const PUT = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc, user } = ctx;
  const body = await req.json();

  const patch: Record<string, unknown> = {};
  if (body.fullName !== undefined) patch.full_name = body.fullName;
  if (body.avatarUrl !== undefined) patch.avatar_url = body.avatarUrl;

  if (Object.keys(patch).length === 0) throw new ApiError("Nothing to update", 400);

  const { data, error } = await svc.from("users")
    .update(patch).eq("id", user.id).select("id, email, full_name, avatar_url").single();

  if (error) throw new ApiError(error.message, 500);
  return ok(data);
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc, user } = ctx;
  const body = await req.json();

  if (body.preferences !== undefined) {
    const { error } = await svc.from("users")
      .update({ preferences: body.preferences })
      .eq("id", user.id);
    if (error) throw new ApiError(error.message, 500);
  }

  return ok({ success: true });
});
