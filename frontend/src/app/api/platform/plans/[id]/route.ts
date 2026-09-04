import { NextRequest } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const id = req.url.split("/").filter(Boolean).pop();

  const { data, error } = await svc.from("platform_plans").select("*").eq("id", id).single();
  if (error || !data) throw new ApiError("Plan not found", 404);
  return ok(data);
});

export const PUT = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const id = req.url.split("/").filter(Boolean).pop();
  const body = await req.json();

  const { data: existing } = await svc.from("platform_plans").select("*").eq("id", id).single();
  if (!existing) throw new ApiError("Plan not found", 404);

  const patch: Record<string, unknown> = {};
  const allowed = ["name", "description", "monthly_price", "annual_price", "currency", "trial_days",
    "user_limit", "storage_limit_gb", "patient_limit", "branch_limit", "modules",
    "popular_badge", "recommended_badge", "ribbon_color", "button_text", "sort_order",
    "is_active", "is_public"];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      patch[key] = body[key];
    }
  }

  if (Object.keys(patch).length === 0) throw new ApiError("Nothing to update", 400);

  // Clean ribbon_color
  if (patch.ribbon_color === "" || patch.ribbon_color === null) patch.ribbon_color = null;

  const { data, error } = await svc.from("platform_plans").update(patch).eq("id", id).select().single();
  if (error) throw new ApiError(error.message, 500);

  await svc.from("platform_audit_logs").insert({
    action: "UPDATE", entity_type: "platform_plans", entity_id: id,
    user_id: ctx.user.id, user_email: ctx.user.email,
    description: `Updated plan "${existing.name}"`,
    old_value: existing, new_value: data,
  });

  return ok(data);
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const id = req.url.split("/").filter(Boolean).pop();

  const { data: existing } = await svc.from("platform_plans").select("*").eq("id", id).single();
  if (!existing) throw new ApiError("Plan not found", 404);

  // Soft delete - deactivate
  const { data, error } = await svc.from("platform_plans")
    .update({ is_active: false }).eq("id", id).select().single();
  if (error) throw new ApiError(error.message, 500);

  await svc.from("platform_audit_logs").insert({
    action: "DELETE", entity_type: "platform_plans", entity_id: id,
    user_id: ctx.user.id, user_email: ctx.user.email,
    description: `Deactivated plan "${existing.name}"`,
  });

  return ok(data);
});
