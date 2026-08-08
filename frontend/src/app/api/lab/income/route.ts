import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/lab/income?from=YYYY-MM-DD&to=YYYY-MM-DD&branch=
// Per-service lab income breakdown (billed vs collected) for the Lab Services
// Income page. Lab income is attributed to invoice items whose description
// matches a lab_services catalogue entry.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from")?.trim() || null;
  const to = sp.get("to")?.trim() || null;
  const branch = sp.get("branch")?.trim() || null;

  const { data, error } = await ctx.svc.rpc("lab_income_report", {
    p_tenant: tenantId,
    p_from: from,
    p_to: to,
    p_branch: branch,
  });
  if (error) throw new ValidationError(error.message);

  return ok((data ?? []).map((r: any) => ({
    serviceId: r.service_id,
    serviceName: r.service_name,
    category: r.category,
    qty: r.qty,
    billed: r.billed,
    paid: r.paid,
  })));
});

export const runtime = "nodejs";