import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/hr/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD — single-call HR KPIs (any staff role).
// Optional from/to drill into a custom attendance/leave window (defaults to current month).
// Runs the auto-absence + leave-balance syncs first (idempotent).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const branch = req.nextUrl.searchParams.get("branch")?.trim() || null;
  const from = req.nextUrl.searchParams.get("from")?.trim() || null;
  const to = req.nextUrl.searchParams.get("to")?.trim() || null;
  await ctx.svc.rpc("hr_mark_missed_shifts", { p_tenant: tenantId, p_branch: ctx.branchId ?? null });
  await ctx.svc.rpc("hr_sync_leave_balances", { p_tenant: tenantId });

  const { data, error } = await ctx.svc.rpc("hr_dashboard", {
    p_tenant: tenantId,
    p_branch: branch,
    ...(from ? { p_from: from } : {}),
    ...(to ? { p_to: to } : {}),
  });
  if (error) throw new ValidationError(error.message);
  return ok(data ?? null);
});
