import { withStaff, ok, requireTenant } from "@/lib/api-utils";
import { resolveParam } from "@/lib/api-utils";
import { resolveEffectivePrices } from "@/lib/pharmacy-pricing";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/drugs?query=&category=&branch_id=
// Doctor's drug picker with auto-complete ranking: the catalog RPC does
// trigram-prefixed substring matching; we re-rank here for typing-ahead —
// exact name prefix of the query first, then generic-name prefix, then
// fuzzy bits so "amg" surfaces "Amoxicillin" before alphabetically earlier
// rows. unitPrice is the branch-aware effective price (branch override ->
// "All branches" override -> catalogue unit_price); priceSource says which
// rule produced it.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const query = (resolveParam(req.nextUrl.searchParams.get("query")) ?? "").trim();
  const category = resolveParam(req.nextUrl.searchParams.get("category"));
  const branchId = resolveParam(req.nextUrl.searchParams.get("branch_id")) ?? ctx.branchId ?? null;

  const { data: drugs, error } = await ctx.svc.rpc("search_pharmacy_drugs", {
    p_tenant: tenantId,
    p_query: query || null,
    p_category: category || null,
    p_branch: branchId || null,
  });
  if (error) return ok([], 0);

  // Attach available stock per drug (sum of non-expired, in-stock batches)
  const rows = Array.isArray(drugs) ? drugs : [];
  const ids = rows.map((d: { id: string }) => d.id);
  const stockMap = new Map<string, number>();
  const effectiveByDrug = new Map<string, number>();
  const sourceByDrug = new Map<string, string>();
  if (ids.length > 0) {
    const [batchRes, priceRes] = await Promise.all([
      ctx.svc
        .from("pharmacy_stock_batches")
        .select("drug_id, quantity_on_hand")
        .in("drug_id", ids)
        .gte("expiry_date", new Date().toISOString().slice(0, 10)),
      resolveEffectivePrices(ctx.svc, tenantId, branchId, ids).catch(() => new Map<string, never>()),
    ]);
    for (const b of batchRes.data ?? []) {
      stockMap.set(b.drug_id, (stockMap.get(b.drug_id) ?? 0) + (b.quantity_on_hand ?? 0));
    }
    for (const d of rows as Array<{ id: string; unit_price: number }>) {
      const eff = priceRes.get(d.id);
      effectiveByDrug.set(d.id, eff?.price ?? Number(d.unit_price ?? 0));
      sourceByDrug.set(d.id, eff?.source ?? "catalog");
    }
  }

  const mapRow = (d: any) => ({
    id: d.id,
    name: d.name,
    genericName: d.generic_name,
    brand: d.brand,
    category: d.category,
    form: d.form,
    dosage: d.dosage,
    unitPrice: effectiveByDrug.get(d.id) ?? d.unit_price,
    priceSource: sourceByDrug.get(d.id) ?? "catalog",
    requiresRx: d.requires_rx,
    isControlled: d.is_controlled,
    supplierId: d.supplier_id ?? null,
    inStock: stockMap.get(d.id) ?? 0,
  });

  if (!query) return ok(rows.map(mapRow));

  // Auto-complete ranking: name prefix beats name substring and generic prefix,
  // and abbreviation (e.g. "amox") still matches via generic-name starts-with.
  const q = query.toLowerCase();
  const score = (d: any): number => {
    const name = (d.name ?? "").toLowerCase();
    const generic = (d.generic_name ?? "").toLowerCase();
    const brand = (d.brand ?? "").toLowerCase();
    if (name.startsWith(q)) return 1000;
    if (generic.startsWith(q)) return 900;
    if (brand.startsWith(q)) return 899;
    if (name.includes(" " + q)) return 800; // word boundary
    if (name.includes(q)) return 700;
    if (generic.includes(q)) return 690;
    return 600;
  };

  return ok(rows.map((d: any) => ({ d, s: score(d) })).sort((a, b) => b.s - a.s).map((x) => mapRow(x.d)));
});

export const runtime = "nodejs";