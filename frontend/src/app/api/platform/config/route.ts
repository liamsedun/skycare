import { NextRequest } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;

  const { data, error } = await svc.from("platform_config").select("*").order("category");
  if (error) throw new ApiError(error.message, 500);

  // Build key-value map with defaults
  const values: Record<string, unknown> = {};
  const defaults: Record<string, { description: string; category: string }> = {};
  for (const row of data || []) {
    values[row.key] = row.value;
    defaults[row.key] = { description: row.description, category: row.category };
  }

  return ok({ values, defaults });
});

export const PUT = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const body = await req.json();
  const { key, value } = body;

  if (!key) throw new ApiError("Key is required", 400);

  const { data: existing } = await svc.from("platform_config").select("*").eq("key", key).single();

  if (existing) {
    const { error } = await svc.from("platform_config")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("key", key);
    if (error) throw new ApiError(error.message, 500);
  } else {
    const { error } = await svc.from("platform_config").insert({
      key, value, description: body.description || "", category: body.category || "general",
    });
    if (error) throw new ApiError(error.message, 500);
  }

  await svc.from("platform_audit_logs").insert({
    action: "UPDATE", entity_type: "platform_config", entity_id: key,
    user_id: ctx.user.id, user_email: ctx.user.email,
    description: `Updated config "${key}"`,
    old_value: existing?.value, new_value: value,
  });

  return ok({ key, value });
});
