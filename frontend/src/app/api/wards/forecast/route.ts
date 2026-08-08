import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/wards/forecast — AI length-of-stay + 7-day occupancy projection.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const branch = req.nextUrl.searchParams.get("branch")?.trim() || null;
  const { data, error } = await ctx.svc.rpc("ward_forecast", {
    p_tenant: tenantId,
    p_branch: branch,
  });
  if (error) throw new ValidationError(error.message);
  return ok(data ?? null);
});