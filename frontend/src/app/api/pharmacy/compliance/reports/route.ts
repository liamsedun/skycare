import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/compliance/reports?report=usage|movements|expiry|supplier&from=&to=&drugId=&supplierId=&form=&days=&includeExpired=
// Proxies the NAFDAC report RPCs (compliance_*).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const report = req.nextUrl.searchParams.get("report");
  const from = req.nextUrl.searchParams.get("from") || undefined;
  const to = req.nextUrl.searchParams.get("to") || undefined;
  const drugId = req.nextUrl.searchParams.get("drugId") || null;
  const supplierId = req.nextUrl.searchParams.get("supplierId") || null;
  const form = req.nextUrl.searchParams.get("form") || null;
  const days = Number(req.nextUrl.searchParams.get("days")) || 90;
  const includeExpired = req.nextUrl.searchParams.get("includeExpired") !== "false";

  if (!report) throw new ValidationError("report is required (usage|movements|expiry|supplier)");
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new ValidationError("from must be YYYY-MM-DD");
  if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new ValidationError("to must be YYYY-MM-DD");

  const rpc: Record<string, [string, Record<string, unknown>]> = {
    usage: [
      "compliance_controlled_usage",
      {
        p_tenant: tenantId,
        p_from: from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
        p_to: to ?? new Date().toISOString().slice(0, 10),
        p_drug: drugId,
        p_form: form,
      },
    ],
    movements: [
      "compliance_stock_movements",
      {
        p_tenant: tenantId,
        p_from: from ? new Date(`${from}T00:00:00`).toISOString() : new Date(Date.now() - 7 * 864e5).toISOString(),
        p_to: to ? new Date(`${to}T23:59:59`).toISOString() : new Date().toISOString(),
        p_drug: drugId,
      },
    ],
    expiry: [
      "compliance_expiry_report",
      { p_tenant: tenantId, p_days: days, p_include_expired: includeExpired },
    ],
    supplier: [
      "compliance_supplier_report",
      { p_tenant: tenantId, p_from: from ?? null, p_to: to ?? null, p_supplier: supplierId },
    ],
  };

  const spec = rpc[report];
  if (!spec) throw new ValidationError("report must be usage|movements|expiry|supplier");

  const { data, error } = await ctx.svc.rpc(spec[0], spec[1]);
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "view",
    entityType: "pharmacy_compliance_reports",
    entityId: report,
    description: `Viewed ${report} compliance report${from ? ` from ${from}` : ""}${to ? ` to ${to}` : ""}`,
  });

  return ok({ report, rows: data ?? [] });
});

export const runtime = "nodejs";