import { withStaff, ok, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/procurement/supplier-offers?supplier_id= — drug offers
// (supplier_drug_prices) for the PO builder, with drug name/unit/category.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const supplierId = req.nextUrl.searchParams.get("supplier_id")?.trim();

  let q = ctx.svc
    .from("supplier_drug_prices")
    .select(
      `id, supplier_id, drug_id, unit_cost, min_order_quantity, lead_time_days, is_preferred, last_updated,
       pharmacy_drugs(name, category, reorder_level)`
    )
    .eq("tenant_id", tenantId);
  if (supplierId) q = q.eq("supplier_id", supplierId);
  const { data, error } = await q.order("is_preferred", { ascending: false });
  if (error) return ok({ error: error.message }, 500);

  return ok(
    (data ?? []).map((o: any) => ({
      id: o.id,
      supplierId: o.supplier_id,
      drugId: o.drug_id,
      drugName: o.pharmacy_drugs?.name ?? "—",
      unit: o.pharmacy_drugs?.form ?? null,
      category: o.pharmacy_drugs?.category ?? null,
      unitCost: Number(o.unit_cost),
      minOrderQuantity: o.min_order_quantity,
      leadTimeDays: o.lead_time_days,
      isPreferred: o.is_preferred,
    }))
  );
});

export const runtime = "nodejs";
