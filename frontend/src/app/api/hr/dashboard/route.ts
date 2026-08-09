import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/hr/dashboard — single-call HR KPIs (any staff role).
// Runs the auto-absence + leave-balance syncs first (idempotent).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const branch = req.nextUrl.searchParams.get("branch")?.trim() || null;
  await ctx.svc.rpc("hr_mark_missed_shifts", { p_tenant: tenantId, p_branch: ctx.branchId ?? null });
  await ctx.svc.rpc("hr_sync_leave_balances", { p_tenant: tenantId });

  const { data, error } = await ctx.svc.rpc("hr_dashboard", { p_tenant: tenantId, p_branch: branch });
  if (error) throw new ValidationError(error.message);
  return ok(data ?? null);
});
