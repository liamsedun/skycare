import { withStaff, ok, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/admin/summary — catalogue headline numbers for the admin tab
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const today = new Date().toISOString().slice(0, 10);
  const in60 = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const [drugsRes, suppliersRes, catsRes, overridesRes, batchesRes] = await Promise.all([
    ctx.svc.from("pharmacy_drugs").select("id, is_active, reorder_level").eq("tenant_id", tenantId),
    ctx.svc.from("pharmacy_suppliers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    ctx.svc.from("pharmacy_categories").select("id", { count: "exact", head: true }).or(`tenant_id.eq.${tenantId},tenant_id.is.null`),
    ctx.svc.from("pharmacy_price_overrides").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    ctx.svc.from("pharmacy_stock_batches").select("drug_id, quantity_on_hand, expiry_date").eq("tenant_id", tenantId),
  ]);

  const drugs = (drugsRes.data ?? []) as Array<{ id: string; is_active: boolean; reorder_level: number }>;
  const batches = (batchesRes.data ?? []) as Array<{ drug_id: string; quantity_on_hand: number; expiry_date: string }>;

  const stockByDrug = new Map<string, number>();
  for (const b of batches) {
    stockByDrug.set(b.drug_id, (stockByDrug.get(b.drug_id) ?? 0) + (b.quantity_on_hand ?? 0));
  }

  const lowStock = drugs.filter((d) => d.is_active && (stockByDrug.get(d.id) ?? 0) <= (d.reorder_level ?? 0)).length;
  const expired = batches.filter((b) => (b.expiry_date ?? "") < today).length;
  const expiringWithin60Days = batches.filter((b) => (b.expiry_date ?? "") >= today && (b.expiry_date ?? "") <= in60).length;

  return ok({
    drugs: drugs.length,
    activeDrugs: drugs.filter((d) => d.is_active).length,
    suppliers: suppliersRes.count ?? 0,
    categories: catsRes.count ?? 0,
    priceOverrides: overridesRes.count ?? 0,
    lowStock,
    expired,
    expiringWithin60Days,
    batches: batches.length,
  });
});

export const runtime = "nodejs";