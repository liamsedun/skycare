import { NextRequest } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const sp = req.nextUrl.searchParams;
  const page = Number(sp.get("page")) || 1;
  const pageSize = Number(sp.get("pageSize")) || 30;

  const from = (page - 1) * pageSize;
  const { data, count, error } = await svc
    .from("platform_announcements").select("*, user:users(full_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) throw new ApiError(error.message, 500);
  return ok({ rows: data || [], total: count || 0, page, pageSize, totalPages: Math.ceil((count || 0) / pageSize) });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc, user } = ctx;
  const body = await req.json();
  const { title, message, type, is_global, tenant_id, starts_at, ends_at, is_dismissable } = body;

  if (!title || !message) throw new ApiError("Title and message are required", 400);

  const { data, error } = await svc.from("platform_announcements").insert({
    title,
    message,
    type: type || "info",
    is_global: is_global !== false,
    tenant_id: is_global !== false ? null : (tenant_id || null),
    starts_at: starts_at || new Date().toISOString(),
    ends_at: ends_at || null,
    is_dismissable: is_dismissable !== false,
    user_id: user.id,
  }).select().single();

  if (error) throw new ApiError(error.message, 500);

  await svc.from("platform_audit_logs").insert({
    action: "CREATE", entity_type: "platform_announcements", entity_id: data.id,
    user_id: user.id, user_email: user.email,
    description: `Created announcement "${title}"`,
  });

  return ok(data, 201);
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc, user } = ctx;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw new ApiError("ID required", 400);

  const { data: existing } = await svc.from("platform_announcements").select("title").eq("id", id).single();
  if (!existing) throw new ApiError("Not found", 404);

  const { error } = await svc.from("platform_announcements").delete().eq("id", id);
  if (error) throw new ApiError(error.message, 500);

  await svc.from("platform_audit_logs").insert({
    action: "DELETE", entity_type: "platform_announcements", entity_id: id,
    user_id: user.id, user_email: user.email,
    description: `Deleted announcement "${existing.title}"`,
  });

  return ok({ deleted: true });
});
