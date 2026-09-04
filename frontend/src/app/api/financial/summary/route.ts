import { withStaff, ok, ValidationError, requireTenant, resolveParam } from "@/lib/api-utils";
import { computeFinancialOverview } from "@/lib/financial-overview";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/financial/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
// Consolidated hospital-wide income + expense picture across EVERY module
// (medical services, ward, lab, pharmacy, other income, general expenses,
// paid payroll, stock purchases). Admin/cashier/accountant/finance roles read.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const from = req.nextUrl.searchParams.get("from")?.trim() || null;
  const to = req.nextUrl.searchParams.get("to")?.trim() || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? "")) {
    throw new ValidationError("from and to are required (YYYY-MM-DD)");
  }
  if (String(from) > String(to)) throw new ValidationError("from must be before or equal to to");

  // Branch filter: read from query param, fall back to JWT claim
  const rawBranch = resolveParam(req.nextUrl.searchParams.get("branch"));
  const branchId = rawBranch && rawBranch !== "all" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawBranch)
    ? rawBranch
    : ctx.branchId;

  const overview = await computeFinancialOverview(ctx.svc, tenantId, { from: from!, to: to! }, branchId);
  return ok(overview);
});

export const runtime = "nodejs";
