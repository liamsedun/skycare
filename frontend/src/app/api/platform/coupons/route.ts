import { NextRequest, NextResponse } from "next/server";
import { withAuth, ok, okPaginated, getPagination, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const sp = req.nextUrl.searchParams;
  const { page, pageSize, from, to } = getPagination(sp);
  const search = sp.get("search")?.trim();

  let query = svc.from("platform_coupons").select("*", { count: "exact" });

  if (search) {
    query = query.ilike("code", `%${search}%`);
  }

  const { data: coupons, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new ApiError(error.message, 500);

  return okPaginated(coupons || [], count || 0, page, pageSize);
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc, user } = ctx;
  const body = await req.json();

  const { code, description, discount_type, discount_value, max_uses, applicable_plans, min_amount, expires_at } = body;

  if (!code || typeof code !== "string") throw new ApiError("Code is required");
  if (!discount_type || !["percent", "fixed"].includes(discount_type)) {
    throw new ApiError("discount_type must be 'percent' or 'fixed'");
  }
  if (!discount_value || discount_value <= 0) throw new ApiError("discount_value must be positive");
  if (discount_type === "percent" && discount_value > 100) {
    throw new ApiError("Percent discount cannot exceed 100");
  }

  const normalizedCode = code.trim().toUpperCase();

  const { data: existing } = await svc
    .from("platform_coupons")
    .select("id")
    .ilike("code", normalizedCode)
    .single();

  if (existing) throw new ApiError("A coupon with this code already exists");

  const { data: coupon, error } = await svc
    .from("platform_coupons")
    .insert({
      code: normalizedCode,
      description: description || null,
      discount_type,
      discount_value,
      max_uses: max_uses || null,
      applicable_plans: applicable_plans || [],
      min_amount: min_amount || 0,
      expires_at: expires_at || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw new ApiError(error.message, 500);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "platform_coupons",
    entityId: coupon.id,
    description: `Created coupon: ${normalizedCode} (${discount_type} ${discount_value})`,
  });

  return ok(coupon, 201);
});
