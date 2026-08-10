import { withStaff, ok, ValidationError, requireTenant, sanitizeLike } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const TODAY = new Date().toISOString().slice(0, 10);
const IN_30D = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

// GET /api/pharmacy/inventory?branch=&category=&q=&page=&limit=&includeInactive=1
// Aggregated stock per drug: net quantity, reorder status, expiry flags, and
// the catalogue fields the inventory view needs (active flag, effective price).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const sp = req.nextUrl.searchParams;
  const branchParam = sp.get("branch") ?? ""; // '' = all (central + branches), 'central', or a branch uuid
  const category = sp.get("category") || null;
  const q = sp.get("q")?.trim() || null;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 50));
  const includeInactive = sp.get("includeInactive") === "1";

  const activeFilter = includeInactive ? undefined : true;
  let countsQuery = ctx.svc.from("pharmacy_drugs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if (activeFilter !== undefined) countsQuery = countsQuery.eq("is_active", activeFilter);

  let drugsQuery = ctx.svc
    .from("pharmacy_drugs")
    .select("id, name, generic_name, brand, category, form, dosage, unit_price, wholesale_price, reorder_level, reorder_qty, sku, requires_rx, is_controlled, nafdac_number, is_active")
    .eq("tenant_id", tenantId)
    .range((page - 1) * limit, page * limit - 1)
    .order("name");
  if (activeFilter !== undefined) drugsQuery = drugsQuery.eq("is_active", activeFilter);
  if (category) drugsQuery = drugsQuery.eq("category", category);
  if (q) drugsQuery = drugsQuery.or(`name.ilike.%${sanitizeLike(q)}%,generic_name.ilike.%${sanitizeLike(q)}%,brand.ilike.%${sanitizeLike(q)}%`);

  const [drugsRes, batchesRes, countsRes] = await Promise.all([
    drugsQuery,
    ctx.svc
      .from("pharmacy_stock_batches")
      .select("drug_id, expiry_date, quantity_on_hand, branch_id")
      .eq("tenant_id", tenantId),
    countsQuery,
  ]);
  if (drugsRes.error) throw new ValidationError(drugsRes.error.message);
  if (batchesRes.error) throw new ValidationError(batchesRes.error.message);
  if (countsRes.error) throw new ValidationError(countsRes.error.message);

  const drugIds = (drugsRes.data ?? []).map((d: { id: string }) => d.id);
  const overrideRes = drugIds.length > 0
    ? await ctx.svc
        .from("pharmacy_price_overrides")
        .select("drug_id, unit_price")
        .eq("tenant_id", tenantId)
        .in("drug_id", drugIds)
    : { data: [] as Array<{ drug_id: string; unit_price: number }>, error: null };
  if (overrideRes.error) throw new ValidationError(overrideRes.error.message);
  const effectivePrice = new Map<string, number>();
  for (const o of overrideRes.data ?? []) {
    if (!effectivePrice.has(o.drug_id)) effectivePrice.set(o.drug_id, o.unit_price);
  }

  const batchesByDrug = new Map<string, Array<{ expiry_date: string; quantity_on_hand: number; branch_id: string | null }>>();
  for (const b of batchesRes.data ?? []) {
    if (branchParam === "central" && b.branch_id !== null) continue;
    if (branchParam && branchParam !== "all" && branchParam !== "central" && b.branch_id !== branchParam) continue;
    const list = batchesByDrug.get(b.drug_id) ?? [];
    list.push(b);
    batchesByDrug.set(b.drug_id, list);
  }

  const items = (drugsRes.data ?? []).map((d: any) => {
    const batches = batchesByDrug.get(d.id) ?? [];
    const stock = batches.reduce((s: number, b) => s + (b.quantity_on_hand ?? 0), 0);
    const reorder = d.reorder_level ?? 0;
    const expiredCount = batches.filter((b) => (b.expiry_date ?? "") < TODAY).length;
    const expiringCount = batches.filter(
      (b) => (b.expiry_date ?? "") >= TODAY && (b.expiry_date ?? "") <= IN_30D
    ).length;
    const unitPrice = Number(d.unit_price ?? 0);
    return {
      id: d.id,
      name: d.name,
      genericName: d.generic_name,
      brand: d.brand,
      category: d.category,
      form: d.form,
      dosage: d.dosage,
      unitPrice,
      wholesalePrice: Number(d.wholesale_price ?? 0),
      effectivePrice: Number(effectivePrice.get(d.id) ?? unitPrice),
      reorderLevel: reorder,
      reorderQty: d.reorder_qty ?? 100,
      sku: d.sku,
      requiresRx: d.requires_rx,
      isControlled: d.is_controlled,
      nafdacNumber: d.nafdac_number,
      isActive: d.is_active,
      stock,
      lowStock: stock <= reorder,
      outOfStock: stock <= 0,
      expiredBatches: expiredCount,
      expiringBatches: expiringCount,
    };
  });

  return ok({ items, total: countsRes.count ?? items.length, page, limit });
});

export const runtime = "nodejs";