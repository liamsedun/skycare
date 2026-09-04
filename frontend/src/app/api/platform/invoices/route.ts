import { NextRequest, NextResponse } from "next/server";
import { withAuth, ok, okPaginated, getPagination, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { tenantCurrency } from "@/lib/server-currency";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const sp = req.nextUrl.searchParams;
  const { page, pageSize, from, to } = getPagination(sp);
  const tenantId = sp.get("tenant_id");
  const status = sp.get("status");

  let query = svc
    .from("subscription_invoices")
    .select("*, tenant:tenants(name, slug, plan)", { count: "exact" });

  if (tenantId) query = query.eq("tenant_id", tenantId);
  if (status) query = query.eq("status", status);

  const { data: invoices, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new ApiError(error.message, 500);

  return okPaginated(invoices || [], count || 0, page, pageSize);
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc, user } = ctx;
  const body = await req.json();

  const { tenant_id, period_start, period_end, amount, currency, coupon_id } = body;
  const { symbol } = await tenantCurrency(svc, tenant_id);

  if (!tenant_id) throw new ApiError("tenant_id is required");
  if (!period_start || !period_end) throw new ApiError("period_start and period_end are required");
  if (!amount || amount <= 0) throw new ApiError("amount must be positive");

  const { data: tenant } = await svc
    .from("tenants")
    .select("id, name")
    .eq("id", tenant_id)
    .single();

  if (!tenant) throw new ApiError("Tenant not found", 404);

  let discount_amount = 0;
  if (coupon_id) {
    const { data: coupon } = await svc
      .from("platform_coupons")
      .select("*")
      .eq("id", coupon_id)
      .eq("is_active", true)
      .single();

    if (!coupon) throw new ApiError("Coupon not found or inactive", 404);

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      throw new ApiError("Coupon has expired");
    }

    if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
      throw new ApiError("Coupon has reached maximum uses");
    }

    if (coupon.applicable_plans && coupon.applicable_plans.length > 0) {
      const { data: t } = await svc.from("tenants").select("plan").eq("id", tenant_id).single();
      if (t && !coupon.applicable_plans.includes(t.plan)) {
        throw new ApiError("Coupon is not applicable to this tenant's plan");
      }
    }

    if (coupon.min_amount && amount < coupon.min_amount) {
      throw new ApiError(`Minimum amount for this coupon is ${coupon.min_amount}`);
    }

    if (coupon.discount_type === "percent") {
      discount_amount = (amount * Number(coupon.discount_value)) / 100;
    } else {
      discount_amount = Math.min(Number(coupon.discount_value), amount);
    }
  }

  const { data: existing } = await svc
    .from("subscription_invoices")
    .select("id")
    .eq("tenant_id", tenant_id)
    .eq("period_start", period_start)
    .single();

  if (existing) throw new ApiError("An invoice already exists for this period");

  const { data: invoice, error } = await svc
    .from("subscription_invoices")
    .insert({
      tenant_id,
      period_start,
      period_end,
      amount,
      currency: currency || "NGN",
      status: "pending",
      coupon_id: coupon_id || null,
      discount_amount,
    })
    .select()
    .single();

  if (error) throw new ApiError(error.message, 500);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "subscription_invoices",
    entityId: invoice.id,
    description: `Created invoice for ${tenant.name}: ${symbol}${amount} (${period_start} to ${period_end})`,
  });

  if (coupon_id && discount_amount > 0) {
    await svc.from("platform_coupon_usage").insert({
      coupon_id,
      tenant_id,
      invoice_id: invoice.id,
      discount_amount,
    });

    const { data: coupon } = await svc
      .from("platform_coupons")
      .select("used_count")
      .eq("id", coupon_id)
      .single();

    if (coupon) {
      await svc
        .from("platform_coupons")
        .update({ used_count: coupon.used_count + 1 })
        .eq("id", coupon_id);
    }
  }

  return ok(invoice, 201);
});
