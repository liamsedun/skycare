import { withStaff, ok, ValidationError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { isAdminRole } from "@/lib/api-utils";
import { logView } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/subscription — tenant subscription & billing (admin only)
export const GET = withStaff(async (req, ctx) => {
  if (!isAdminRole(ctx.role)) {
    throw new ForbiddenError("Only administrators can view subscription billing");
  }
  const tenantId = requireTenant(ctx);

  const [tenantRes, invoicesRes] = await Promise.all([
    ctx.svc
      .from("tenants")
      .select("id, name, slug, email, plan, currency, trial_ends_at, is_active, created_at")
      .eq("id", tenantId)
      .maybeSingle(),
    ctx.svc
      .from("subscription_invoices")
      .select("id, period_start, period_end, amount, currency, status, provider, provider_ref, created_at")
      .eq("tenant_id", tenantId)
      .order("period_start", { ascending: false })
      .limit(36),
  ]);

  if (!tenantRes.data) throw new ValidationError("Tenant not found");

  await logView(req, ctx, "tenants", tenantId, "Viewed subscription billing");

  return ok({ tenant: tenantRes.data, invoices: invoicesRes.data ?? [] });
});

export const runtime = "nodejs";