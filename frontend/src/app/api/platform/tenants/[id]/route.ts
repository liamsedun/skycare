import { NextRequest, NextResponse } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const id = req.url.split("/").filter(Boolean).pop();

  if (!id) throw new ApiError("Missing tenant id");

  const { data: tenant, error } = await svc
    .from("tenants")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !tenant) throw new ApiError("Tenant not found", 404);

  // Get counts
  const { count: userCount } = await svc
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", id);

  const { count: patientCount } = await svc
    .from("patients")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", id);

  // Get invoices
  const { data: invoices } = await svc
    .from("subscription_invoices")
    .select("*")
    .eq("tenant_id", id)
    .order("created_at", { ascending: false });

  // Get coupon usage
  const { data: couponUsage } = await svc
    .from("platform_coupon_usage")
    .select("*, coupon:platform_coupons(code, discount_type, discount_value)")
    .eq("tenant_id", id);

  return ok({
    ...tenant,
    userCount: userCount || 0,
    patientCount: patientCount || 0,
    invoices: invoices || [],
    couponUsage: couponUsage || [],
  });
});

export const PUT = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const id = req.url.split("/").filter(Boolean).pop();
  const body = await req.json();

  if (!id) throw new ApiError("Missing tenant id");

  const { data: tenant, error: loadErr } = await svc
    .from("tenants")
    .select("*")
    .eq("id", id)
    .single();

  if (loadErr || !tenant) throw new ApiError("Tenant not found", 404);

  const patch: Record<string, unknown> = {};

  if (body.subscription_status) {
    const valid = ["trial", "active", "past_due", "suspended", "cancelled"];
    if (!valid.includes(body.subscription_status)) {
      throw new ApiError("Invalid subscription status");
    }
    patch.subscription_status = body.subscription_status;
  }

  if (body.plan) {
    const validPlans = ["basic", "pro", "enterprise", "custom"];
    if (!validPlans.includes(body.plan)) {
      throw new ApiError("Invalid plan");
    }
    patch.plan = body.plan;
  }

  if (body.trial_ends_at !== undefined) {
    patch.trial_ends_at = body.trial_ends_at || null;
  }

  if (body.is_active !== undefined) {
    patch.is_active = body.is_active;
  }

  if (body.website_enabled !== undefined) {
    patch.website_enabled = body.website_enabled;
  }

  if (Object.keys(patch).length === 0) {
    throw new ApiError("Nothing to update");
  }

  const { data: updated, error } = await svc
    .from("tenants")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new ApiError(error.message, 500);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "tenants",
    entityId: id,
    description: `Updated tenant ${tenant.name}: ${Object.keys(patch).join(", ")}`,
    changes: patch,
  });

  return ok(updated);
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const id = req.url.split("/").filter(Boolean).pop();

  if (!id) throw new ApiError("Missing tenant id");

  const { data: tenant, error: loadErr } = await svc
    .from("tenants")
    .select("id, name")
    .eq("id", id)
    .single();

  if (loadErr || !tenant) throw new ApiError("Tenant not found", 404);

  const { error } = await svc.from("tenants").delete().eq("id", id);
  if (error) throw new ApiError(error.message, 500);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "tenants",
    entityId: id,
    description: `Deleted tenant: ${tenant.name}`,
  });

  return ok({ deleted: true, name: tenant.name });
});
