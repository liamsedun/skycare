import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/lab/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD&branch=&months=
// Single-call lab analytics: window KPIs (income, patients served, invoices,
// items), monthly series, top services by revenue and request status split.
// Income is attributed from invoice items whose description matches a
// lab_services catalogue entry (the lab module bills via central invoices).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from")?.trim() || null;
  const to = sp.get("to")?.trim() || null;
  const branch = sp.get("branch")?.trim() || null;
  const months = Math.min(Math.max(parseInt(sp.get("months") ?? "6", 10) || 6, 1), 36);

  const { data, error } = await ctx.svc.rpc("lab_analytics_dashboard", {
    p_tenant: tenantId,
    p_from: from,
    p_to: to,
    p_branch: branch,
    p_months: months,
  });
  if (error) throw new ValidationError(error.message);

  return ok(data ?? null);
});

export const runtime = "nodejs";