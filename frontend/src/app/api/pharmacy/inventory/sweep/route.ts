import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/pharmacy/inventory/sweep — re-check every batch against the
// expiry horizon and fire in-app notifications for any that are expiring
// soon or already expired (the daily "sweep" hook for alert freshness).
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { data: checked, error } = await ctx.svc.rpc("fn_pharmacy_expiry_sweep", {
    p_tenant: tenantId,
  });
  if (error) throw new ValidationError(error.message);
  return ok({ checked: Number(checked ?? 0) });
});

export const runtime = "nodejs";