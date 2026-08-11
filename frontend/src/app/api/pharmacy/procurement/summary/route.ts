import { withStaff, ok, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/procurement/summary — per-supplier bought/paid/outstanding
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { data, error } = await ctx.svc.rpc("pharmacy_supplier_balances", {
    p_tenant_id: tenantId,
  });
  if (error) return ok({ error: error.message }, 500);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const totals = rows.reduce<{ ordered: number; bought: number; paid: number; outstanding: number }>(
    (acc, r) => {
      acc.ordered += Number(r.total_ordered ?? 0);
      acc.bought += Number(r.total_bought ?? 0);
      acc.paid += Number(r.total_paid ?? 0);
      acc.outstanding += Number(r.outstanding ?? 0);
      return acc;
    },
    { ordered: 0, bought: 0, paid: 0, outstanding: 0 }
  );

  return ok({
    totals: {
      total_ordered: Math.round(totals.ordered * 100) / 100,
      total_bought: Math.round(totals.bought * 100) / 100,
      total_paid: Math.round(totals.paid * 100) / 100,
      total_outstanding: Math.round(totals.outstanding * 100) / 100,
    },
    suppliers: rows.map((r) => ({
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      code: r.code,
      totalOrdered: Number(r.total_ordered ?? 0),
      totalBought: Number(r.total_bought ?? 0),
      totalPaid: Number(r.total_paid ?? 0),
      outstanding: Number(r.outstanding ?? 0),
      poCount: Number(r.po_count ?? 0),
      paymentCount: Number(r.payment_count ?? 0),
      lastBoughtAt: r.last_bought_at ?? null,
      lastPaidAt: r.last_paid_at ?? null,
    })),
  });
});

export const runtime = "nodejs";
