import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const TODAY = new Date().toISOString().slice(0, 10);

// GET /api/pharmacy/inventory/expiring?days=30&includeExpired=1
// Batches expiring within the window (status expiring_soon) plus already
// expired batches (status expired) when includeExpired is set.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const sp = req.nextUrl.searchParams;
  const days = Math.min(365, Math.max(1, Number(sp.get("days")) || 30));
  const includeExpired = sp.get("includeExpired") === "1";
  const horizon = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

  const { data: batches, error } = await ctx.svc
    .from("pharmacy_stock_batches")
    .select("id, drug_id, branch_id, batch_number, expiry_date, quantity_on_hand, cost_price")
    .eq("tenant_id", tenantId)
    .gt("quantity_on_hand", 0)
    .lte("expiry_date", horizon)
    .order("expiry_date", { ascending: true });
  if (error) throw new ValidationError(error.message);

  const drugIds = Array.from(new Set((batches ?? []).map((b) => b.drug_id)));
  const drugs = new Map<string, { name: string; brand: string }>();
  if (drugIds.length > 0) {
    const { data: d, error: dErr } = await ctx.svc
      .from("pharmacy_drugs")
      .select("id, name, brand")
      .in("id", drugIds)
      .eq("tenant_id", tenantId);
    if (dErr) throw new ValidationError(dErr.message);
    for (const row of d ?? []) drugs.set(row.id, { name: row.name, brand: row.brand });
  }

  const items = (batches ?? [])
    .map((b) => {
      const expired = (b.expiry_date ?? "") < TODAY;
      if (expired && !includeExpired) return null;
      const d = drugs.get(b.drug_id);
      return {
        batchId: b.id,
        batchNumber: b.batch_number,
        drugId: b.drug_id,
        drugName: d?.name ?? null,
        brand: d?.brand ?? null,
        branchId: b.branch_id,
        expiryDate: b.expiry_date,
        quantity: b.quantity_on_hand,
        status: expired ? ("expired" as const) : ("expiring_soon" as const),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const expired = items.filter((i) => i.status === "expired").length;
  return ok({ items, total: items.length, expiredCount: expired, days });
});

export const runtime = "nodejs";