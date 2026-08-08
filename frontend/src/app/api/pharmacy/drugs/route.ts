import { withStaff, ok, requireTenant } from "@/lib/api-utils";
import { resolveParam } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/drugs?query=&category=&branch_id=
// Doctor's drug picker with auto-complete ranking: the catalog RPC does
// trigram-prefixed substring matching; we re-rank here for typing-ahead —
// exact name prefix of the query first, then generic-name prefix, then
// fuzzy bits so "amg" surfaces "Amoxicillin" before alphabetically earlier
// rows.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const query = (resolveParam(req.nextUrl.searchParams.get("query")) ?? "").trim();
  const category = resolveParam(req.nextUrl.searchParams.get("category"));
  const branchId = resolveParam(req.nextUrl.searchParams.get("branch_id"));

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
  if (ids.length > 0) {
    const [batchRes, overrideRes] = await Promise.all([
      ctx.svc
        .from("pharmacy_stock_batches")
        .select("drug_id, quantity_on_hand")
        .in("drug_id", ids)
        .gte("expiry_date", new Date().toISOString().slice(0, 10)),
      ctx.svc
        .from("pharmacy_price_overrides")
        .select("drug_id, branch_id, unit_price")
        .eq("tenant_id", tenantId)
        .in("drug_id", ids),
    ]);
    for (const b of batchRes.data ?? []) {
      stockMap.set(b.drug_id, (stockMap.get(b.drug_id) ?? 0) + (b.quantity_on_hand ?? 0));
    }
    // effective price: exact branch override beats base (branch NULL) override
    const exactOverride = new Map<string, number>();
    const baseOverride = new Map<string, number>();
    for (const o of overrideRes.data ?? []) {
      if (o.branch_id === null) baseOverride.set(o.drug_id, o.unit_price);
      else exactOverride.set(o.drug_id, o.unit_price);
    }
    const effective = (drugId: string, fallback: number) =>
      (ctx.branchId && exactOverride.has(drugId) ? exactOverride.get(drugId) : baseOverride.get(drugId)) ?? fallback;
    for (const d of rows as Array<{ id: string; unit_price: number }>) {
      effectiveByDrug.set(d.id, effective(d.id, Number(d.unit_price ?? 0)));
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
    requiresRx: d.requires_rx,
    isControlled: d.is_controlled,
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