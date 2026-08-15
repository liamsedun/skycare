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

  // opening balances (migration seeds) — carried-forward money, fold into totals
  const { data: openingRows, error: openErr } = await ctx.svc
    .from("pharmacy_supplier_opening_balances")
    .select("supplier_id, total_bought, total_paid")
    .eq("tenant_id", tenantId);
  if (openErr) return ok({ error: openErr.message }, 500);
  const openingBySupplier = new Map<string, { bought: number; paid: number }>();
  for (const o of openingRows ?? []) {
    openingBySupplier.set(o.supplier_id, {
      bought: Number(o.total_bought ?? 0),
      paid: Number(o.total_paid ?? 0),
    });
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const totals = rows.reduce<{ ordered: number; bought: number; paid: number; outstanding: number }>(
    (acc, r) => {
      const ob = openingBySupplier.get(r.supplier_id as string);
      const bought = Number(r.total_bought ?? 0) + (ob?.bought ?? 0);
      const paid = Number(r.total_paid ?? 0) + (ob?.paid ?? 0);
      acc.ordered += Number(r.total_ordered ?? 0);
      acc.bought += bought;
      acc.paid += paid;
      acc.outstanding += bought - paid;
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
    suppliers: rows.map((r) => {
      const ob = openingBySupplier.get(r.supplier_id as string);
      const bought = Number(r.total_bought ?? 0) + (ob?.bought ?? 0);
      const paid = Number(r.total_paid ?? 0) + (ob?.paid ?? 0);
      return {
        supplierId: r.supplier_id,
        supplierName: r.supplier_name,
        code: r.code,
        totalOrdered: Number(r.total_ordered ?? 0),
        totalBought: Math.round(bought * 100) / 100,
        totalPaid: Math.round(paid * 100) / 100,
        outstanding: Math.round((bought - paid) * 100) / 100,
        openingBought: ob?.bought ?? 0,
        openingPaid: ob?.paid ?? 0,
        poCount: Number(r.po_count ?? 0),
        paymentCount: Number(r.payment_count ?? 0),
        lastBoughtAt: r.last_bought_at ?? null,
        lastPaidAt: r.last_paid_at ?? null,
      };
    }),
  });
});

export const runtime = "nodejs";
