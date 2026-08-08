import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const TODAY = new Date().toISOString().slice(0, 10);
const IN_30D = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

// GET /api/pharmacy/inventory?branch=&category=&q=&page=&limit=
// Aggregated stock per drug: net quantity, reorder status, and expiry flags.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const sp = req.nextUrl.searchParams;
  const branchParam = sp.get("branch") ?? ""; // '' = all (central + branches), 'central', or a branch uuid
  const category = sp.get("category") || null;
  const q = sp.get("q")?.trim() || null;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 50));

  const counts = await ctx.svc
    .from("pharmacy_drugs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  let drugsQuery = ctx.svc
    .from("pharmacy_drugs")
    .select("id, name, generic_name, brand, category, form, dosage, unit_price, wholesale_price, reorder_level, reorder_qty")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .range((page - 1) * limit, page * limit - 1)
    .order("name");
  if (category) drugsQuery = drugsQuery.eq("category", category);
  if (q) drugsQuery = drugsQuery.or(`name.ilike.%${q}%,generic_name.ilike.%${q}%,brand.ilike.%${q}%`);

  const [drugsRes, batchesRes] = await Promise.all([
    drugsQuery,
    ctx.svc
      .from("pharmacy_stock_batches")
      .select("drug_id, expiry_date, quantity_on_hand, branch_id")
      .eq("tenant_id", tenantId),
  ]);
  if (drugsRes.error) throw new ValidationError(drugsRes.error.message);
  if (batchesRes.error) throw new ValidationError(batchesRes.error.message);

  const batchesByDrug = new Map<string, Array<{ expiry_date: string; quantity_on_hand: number; branch_id: string | null }>>();
  for (const b of batchesRes.data ?? []) {
    if (branchParam === "central" && b.branch_id !== null) continue;
    if (branchParam && branchParam !== "all" && branchParam !== "central" && b.branch_id !== branchParam) continue;
    const list = batchesByDrug.get(b.drug_id) ?? [];
    list.push(b);
    batchesByDrug.set(b.drug_id, list);
  }

  const items = (drugsRes.data ?? []).map((d) => {
    const batches = batchesByDrug.get(d.id) ?? [];
    const stock = batches.reduce((s, b) => s + (b.quantity_on_hand ?? 0), 0);
    const reorder = d.reorder_level ?? 0;
    const expiredCount = batches.filter((b) => (b.expiry_date ?? "") < TODAY).length;
    const expiringCount = batches.filter(
      (b) => (b.expiry_date ?? "") >= TODAY && (b.expiry_date ?? "") <= IN_30D
    ).length;
    return {
      id: d.id,
      name: d.name,
      genericName: d.generic_name,
      brand: d.brand,
      category: d.category,
      form: d.form,
      dosage: d.dosage,
      unitPrice: Number(d.unit_price ?? 0),
      wholesalePrice: Number(d.wholesale_price ?? 0),
      reorderLevel: reorder,
      reorderQty: d.reorder_qty ?? 100,
      stock,
      lowStock: stock <= reorder,
      outOfStock: stock <= 0,
      expiredBatches: expiredCount,
      expiringBatches: expiringCount,
    };
  });

  return ok({ items, total: counts.count ?? items.length, page, limit });
});

export const runtime = "nodejs";