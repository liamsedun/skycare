import { NextRequest } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;

  const { data, error } = await svc
    .from("platform_plans")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw new ApiError(error.message, 500);
  return ok(data);
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const body = await req.json();

  const { name, code, description, monthly_price, annual_price, currency, trial_days,
    user_limit, storage_limit_gb, patient_limit, branch_limit, modules,
    popular_badge, recommended_badge, ribbon_color, button_text, sort_order,
    is_active, is_public } = body;

  if (!name || !code) throw new ApiError("Name and code are required", 400);
  if (!/^[a-z0-9-]+$/.test(code)) throw new ApiError("Code must be lowercase alphanumeric with hyphens", 400);

  const { data: existing } = await svc.from("platform_plans").select("id").eq("code", code).single();
  if (existing) throw new ApiError("A plan with this code already exists", 400);

  const { data, error } = await svc.from("platform_plans").insert({
    name, code, description: description || "",
    monthly_price: Number(monthly_price) || 0,
    annual_price: Number(annual_price) || 0,
    currency: currency || "NGN",
    trial_days: Number(trial_days) || 0,
    user_limit: Number(user_limit) || 1,
    storage_limit_gb: Number(storage_limit_gb) || 1,
    patient_limit: Number(patient_limit) || 100,
    branch_limit: Number(branch_limit) || 1,
    modules: modules || [],
    popular_badge: !!popular_badge,
    recommended_badge: !!recommended_badge,
    ribbon_color: ribbon_color || null,
    button_text: button_text || "Subscribe",
    sort_order: Number(sort_order) || 0,
    is_active: is_active !== false,
    is_public: is_public !== false,
  }).select().single();

  if (error) throw new ApiError(error.message, 500);

  // Audit
  await svc.from("platform_audit_logs").insert({
    action: "CREATE", entity_type: "platform_plans", entity_id: data.id,
    user_id: ctx.user.id, user_email: ctx.user.email,
    description: `Created plan "${name}" (${code})`,
    new_value: data,
  });

  return ok(data, 201);
});
