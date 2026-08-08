import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/wards/dashboard?branch= — single-call ward KPIs (staff).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const branch = req.nextUrl.searchParams.get("branch")?.trim() || null;
  const { data, error } = await ctx.svc.rpc("ward_dashboard", {
    p_tenant: tenantId,
    p_branch: branch,
  });
  if (error) throw new ValidationError(error.message);
  return ok(data ?? null);
});