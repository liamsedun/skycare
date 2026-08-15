import type { SupabaseClient } from "@supabase/supabase-js";

// Branch-aware drug pricing, mirroring the SQL helper effective_drug_price()
// (migration 0041): a branch-specific pharmacy_price_overrides row beats the
// "All branches" (branch_id NULL) override, which beats the catalogue
// unit_price, which beats wholesale. Sale-time routes resolve prices through
// this so the effective retail price always follows the user's branch claim.

export type PriceSource = "branch_override" | "base_override" | "catalog" | "wholesale";

export interface EffectivePrice {
  price: number;
  source: PriceSource;
}

export interface PriceOverrideRow {
  drug_id: string;
  branch_id: string | null;
  unit_price: number;
}

export async function resolveEffectivePrices(
  svc: SupabaseClient,
  tenantId: string,
  branchId: string | null,
  drugIds: string[]
): Promise<Map<string, EffectivePrice>> {
  const ids = Array.from(new Set(drugIds.filter(Boolean)));
  const result = new Map<string, EffectivePrice>();
  if (ids.length === 0) return result;

  const [overrideRes, drugRes] = await Promise.all([
    svc
      .from("pharmacy_price_overrides")
      .select("drug_id, branch_id, unit_price")
      .eq("tenant_id", tenantId)
      .in("drug_id", ids),
    svc
      .from("pharmacy_drugs")
      .select("id, unit_price, wholesale_price")
      .in("id", ids)
      .eq("tenant_id", tenantId),
  ]);
  if (overrideRes.error || drugRes.error) {
    throw new Error(overrideRes.error?.message ?? drugRes.error?.message ?? "Price lookup failed");
  }

  const branchOverride = new Map<string, number>();
  const baseOverride = new Map<string, number>();
  for (const o of (overrideRes.data ?? []) as PriceOverrideRow[]) {
    if (o.branch_id === null) {
      if (!baseOverride.has(o.drug_id)) baseOverride.set(o.drug_id, Number(o.unit_price));
    } else if (branchId && o.branch_id === branchId) {
      if (!branchOverride.has(o.drug_id)) branchOverride.set(o.drug_id, Number(o.unit_price));
    }
  }

  const fallback = new Map<string, { unit_price: number; wholesale_price: number }>();
  for (const d of (drugRes.data ?? []) as Array<{ id: string; unit_price: number; wholesale_price: number }>) {
    fallback.set(d.id, {
      unit_price: Number(d.unit_price ?? 0),
      wholesale_price: Number(d.wholesale_price ?? 0),
    });
  }

  for (const id of ids) {
    if (branchOverride.has(id)) {
      result.set(id, { price: branchOverride.get(id)!, source: "branch_override" });
    } else if (baseOverride.has(id)) {
      result.set(id, { price: baseOverride.get(id)!, source: "base_override" });
    } else {
      const f = fallback.get(id);
      if (f && f.unit_price > 0) {
        result.set(id, { price: f.unit_price, source: "catalog" });
      } else if (f) {
        result.set(id, { price: f.wholesale_price, source: "wholesale" });
      } else {
        result.set(id, { price: 0, source: "catalog" });
      }
    }
  }

  return result;
}
