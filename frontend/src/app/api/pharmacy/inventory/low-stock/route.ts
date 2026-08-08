import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const TODAY = new Date().toISOString().slice(0, 10);

// GET /api/pharmacy/inventory/low-stock?branch=
// Drugs whose net stock (across batches) is at or below reorder_level.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const branchParam = req.nextUrl.searchParams.get("branch") ?? "";

  const [drugsRes, batchesRes] = await Promise.all([
    ctx.svc
      .from("pharmacy_drugs")
      .select("id, name, generic_name, brand, category, form, dosage, unit_price, reorder_level, reorder_qty")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name"),
    ctx.svc
      .from("pharmacy_stock_batches")
      .select("drug_id, quantity_on_hand, branch_id")
      .eq("tenant_id", tenantId),
  ]);
  if (drugsRes.error) throw new ValidationError(drugsRes.error.message);
  if (batchesRes.error) throw new ValidationError(batchesRes.error.message);

  const byDrug = new Map<string, number>();
  for (const b of batchesRes.data ?? []) {
    if (branchParam === "central" && b.branch_id !== null) continue;
    if (branchParam && branchParam !== "all" && branchParam !== "central" && b.branch_id !== branchParam) continue;
    byDrug.set(b.drug_id, (byDrug.get(b.drug_id) ?? 0) + (b.quantity_on_hand ?? 0));
  }

  const low = (drugsRes.data ?? [])
    .map((d) => {
      const stock = byDrug.get(d.id) ?? 0;
      const reorder = d.reorder_level ?? 0;
      return {
        id: d.id,
        name: d.name,
        genericName: d.generic_name,
        brand: d.brand,
        category: d.category,
        form: d.form,
        dosage: d.dosage,
        unitPrice: Number(d.unit_price ?? 0),
        reorderLevel: reorder,
        reorderQty: d.reorder_qty ?? 100,
        stock,
        outOfStock: stock <= 0,
      };
    })
    .filter((d) => d.stock <= d.reorderLevel)
    .sort((a, b) => a.stock - b.stock);

  return ok({ items: low, total: low.length });
});

export const runtime = "nodejs";