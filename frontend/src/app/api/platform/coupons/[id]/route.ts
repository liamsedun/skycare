import { NextRequest, NextResponse } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const id = req.url.split("/").filter(Boolean).pop();

  if (!id) throw new ApiError("Missing coupon id");

  const { data: coupon, error } = await svc
    .from("platform_coupons")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !coupon) throw new ApiError("Coupon not found", 404);

  const { data: usage } = await svc
    .from("platform_coupon_usage")
    .select("id, tenant_id, discount_amount, used_at, tenant:tenants(name, slug)")
    .eq("coupon_id", id);

  return ok({ ...coupon, usage: usage || [] });
});

export const PUT = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const id = req.url.split("/").filter(Boolean).pop();
  const body = await req.json();

  if (!id) throw new ApiError("Missing coupon id");

  const { data: existing } = await svc
    .from("platform_coupons")
    .select("id")
    .eq("id", id)
    .single();

  if (!existing) throw new ApiError("Coupon not found", 404);

  const patch: Record<string, unknown> = {};

  if (body.code !== undefined) {
    const normalizedCode = body.code.trim().toUpperCase();
    const { data: dup } = await svc
      .from("platform_coupons")
      .select("id")
      .ilike("code", normalizedCode)
      .neq("id", id)
      .single();
    if (dup) throw new ApiError("A coupon with this code already exists");
    patch.code = normalizedCode;
  }

  if (body.description !== undefined) patch.description = body.description || null;
  if (body.discount_type !== undefined) {
    if (!["percent", "fixed"].includes(body.discount_type)) {
      throw new ApiError("discount_type must be 'percent' or 'fixed'");
    }
    patch.discount_type = body.discount_type;
  }
  if (body.discount_value !== undefined) {
    if (body.discount_value <= 0) throw new ApiError("discount_value must be positive");
    patch.discount_value = body.discount_value;
  }
  if (body.max_uses !== undefined) patch.max_uses = body.max_uses || null;
  if (body.applicable_plans !== undefined) patch.applicable_plans = body.applicable_plans || [];
  if (body.min_amount !== undefined) patch.min_amount = body.min_amount || 0;
  if (body.expires_at !== undefined) patch.expires_at = body.expires_at || null;
  if (body.is_active !== undefined) patch.is_active = body.is_active;

  if (Object.keys(patch).length === 0) {
    throw new ApiError("Nothing to update");
  }

  const { data: updated, error } = await svc
    .from("platform_coupons")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new ApiError(error.message, 500);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "platform_coupons",
    entityId: id,
    description: `Updated coupon: ${Object.keys(patch).join(", ")}`,
    changes: patch,
  });

  return ok(updated);
});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const id = req.url.split("/").filter(Boolean).pop();

  if (!id) throw new ApiError("Missing coupon id");

  const { data: coupon } = await svc
    .from("platform_coupons")
    .select("id, code")
    .eq("id", id)
    .single();

  if (!coupon) throw new ApiError("Coupon not found", 404);

  const { error } = await svc.from("platform_coupons").delete().eq("id", id);
  if (error) throw new ApiError(error.message, 500);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "platform_coupons",
    entityId: id,
    description: `Deleted coupon: ${coupon.code}`,
  });

  return ok({ deleted: true, code: coupon.code });
});
