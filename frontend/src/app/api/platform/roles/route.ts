import { NextRequest } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;

  const { data, error } = await svc
    .from("platform_role_permissions").select("*").order("role");

  if (error) throw new ApiError(error.message, 500);
  return ok(data || []);
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc, user } = ctx;
  const body = await req.json();
  const { role, permissions } = body;

  if (!role || !Array.isArray(permissions)) throw new ApiError("Role and permissions array required", 400);

  // Check uniqueness
  const { data: existing } = await svc.from("platform_role_permissions").select("role").eq("role", role).single();
  if (existing) throw new ApiError("Role already exists", 400);

  const { data, error } = await svc.from("platform_role_permissions").insert({
    role, permissions,
  }).select().single();

  if (error) throw new ApiError(error.message, 500);

  await svc.from("platform_audit_logs").insert({
    action: "CREATE", entity_type: "platform_role_permissions", entity_id: data.id,
    user_id: user.id, user_email: user.email,
    description: `Created platform role "${role}" with ${permissions.length} permissions`,
  });

  return ok(data, 201);
});

export const PUT = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc, user } = ctx;
  const body = await req.json();
  const { role, permissions } = body;

  if (!role || !Array.isArray(permissions)) throw new ApiError("Role and permissions array required", 400);

  const { data: existing } = await svc.from("platform_role_permissions").select("role").eq("role", role).single();
  if (!existing) throw new ApiError("Role not found", 404);

  const { data, error } = await svc.from("platform_role_permissions").update({ permissions }).eq("role", role).select().single();
  if (error) throw new ApiError(error.message, 500);

  await svc.from("platform_audit_logs").insert({
    action: "UPDATE", entity_type: "platform_role_permissions", entity_id: data.id,
    user_id: user.id, user_email: user.email,
    description: `Updated platform role "${role}" — ${permissions.length} permissions`,
  });

  return ok(data);
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc, user } = ctx;
  const role = req.nextUrl.searchParams.get("role");
  if (!role) throw new ApiError("Role name required", 400);

  // Protect built-in roles
  const BUILTINS = ["super_admin", "admin", "support_manager", "analyst", "billing_manager", "viewer"];
  if (BUILTINS.includes(role)) throw new ApiError("Cannot delete built-in role", 400);

  const { data: existing } = await svc.from("platform_role_permissions").select("role").eq("role", role).single();
  if (!existing) throw new ApiError("Role not found", 404);

  const { error } = await svc.from("platform_role_permissions").delete().eq("role", role);
  if (error) throw new ApiError(error.message, 500);

  await svc.from("platform_audit_logs").insert({
    action: "DELETE", entity_type: "platform_role_permissions", entity_id: role,
    user_id: user.id, user_email: user.email,
    description: `Deleted platform role "${role}"`,
  });

  return ok({ deleted: true });
});
