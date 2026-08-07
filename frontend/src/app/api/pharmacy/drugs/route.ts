import { withStaff, ok, requireTenant } from "@/lib/api-utils";
import { resolveParam } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/drugs?query=&category=&branch_id=
// Doctor's drug picker — searches the pharmacy catalog (name / generic /
// brand trigram indexes) via the search_pharmacy_drugs RPC. Also returns
// available stock (sum of non-expired batch quantities) so the clinician
// knows what's in-house before prescribing.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const query = resolveParam(req.nextUrl.searchParams.get("query"));
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
  if (ids.length > 0) {
    const { data: batches } = await ctx.svc
      .from("pharmacy_stock_batches")
      .select("drug_id, quantity_on_hand")
      .in("drug_id", ids)
      .gte("expiry_date", new Date().toISOString().slice(0, 10));
    for (const b of batches ?? []) {
      stockMap.set(b.drug_id, (stockMap.get(b.drug_id) ?? 0) + (b.quantity_on_hand ?? 0));
    }
  }

  return ok(
    rows.map((d: any) => ({
      id: d.id,
      name: d.name,
      genericName: d.generic_name,
      brand: d.brand,
      category: d.category,
      form: d.form,
      dosage: d.dosage,
      unitPrice: d.unit_price,
      requiresRx: d.requires_rx,
      isControlled: d.is_controlled,
      inStock: stockMap.get(d.id) ?? 0,
    }))
  );
});

export const runtime = "nodejs";