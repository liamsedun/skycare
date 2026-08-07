import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export interface DrugBatch {
  id: string;
  batchNumber: string;
  expiryDate: string;
  quantityOnHand: number;
  costPrice: number;
  location: string | null;
}

// GET /api/pharmacy/drugs/[id]/batches — dispensable stock batches for a
// drug (non-expired, quantity > 0), oldest-expiry first (FEFO). The
// pharmacist picks a batch per item during dispensing.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const segments = req.nextUrl.pathname.split("/");
  const drugId = segments[segments.length - 2];

  const { data: drug, error: drugError } = await ctx.svc
    .from("pharmacy_drugs")
    .select("id, name")
    .eq("id", drugId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (drugError || !drug) throw new NotFoundError("Drug not found");

  const { data: batches, error } = await ctx.svc
    .from("pharmacy_stock_batches")
    .select("id, batch_number, expiry_date, quantity_on_hand, cost_price, location")
    .eq("drug_id", drugId)
    .eq("tenant_id", tenantId)
    .gt("quantity_on_hand", 0)
    .gte("expiry_date", new Date().toISOString().slice(0, 10))
    .order("expiry_date", { ascending: true });

  if (error) throw new ValidationError(error.message);

  return ok({
    drug: { id: drug.id, name: drug.name },
    batches: (batches ?? []).map((b) => ({
      id: b.id,
      batchNumber: b.batch_number,
      expiryDate: b.expiry_date,
      quantityOnHand: b.quantity_on_hand,
      costPrice: b.cost_price,
      location: b.location,
    })),
  });
});

export const runtime = "nodejs";