import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/pharmacy/restock
// Body: { drugId, branchId?, batchNumber, expiryDate, quantity, costPrice?, supplierId?, location? }
// Atomic: batch row (+ ledger 'in') through pharmacy_restock. Throws 400 on
// expired goods, missing batch number or non-positive quantity.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as {
    drugId?: string;
    branchId?: string | null;
    batchNumber?: string;
    expiry?: string;
    quantity?: number;
    costPrice?: number;
    supplierId?: string | null;
    location?: string | null;
  };

  if (!body.drugId) throw new ValidationError("drugId is required");
  if (!body.batchNumber?.trim()) throw new ValidationError("batchNumber is required");
  if (!body.expiry) throw new ValidationError("expiry date is required");
  const qty = Math.floor(Number(body.quantity) || 0);
  if (qty <= 0) throw new ValidationError("quantity must be positive");

  const { data: batchId, error } = await ctx.svc.rpc("pharmacy_restock", {
    p_tenant_id: tenantId,
    p_drug: body.drugId,
    p_branch: body.branchId ?? null,
    p_batch_number: body.batchNumber.trim(),
    p_expiry: body.expiry.slice(0, 10),
    p_qty: qty,
    p_cost: Number(body.costPrice) || 0,
    p_supplier: body.supplierId ?? null,
    p_location: body.location?.trim() || null,
    p_created_by: ctx.user.id,
    p_source_ref: "restock-api",
  });
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "pharmacy_stock_batches",
    entityId: String(batchId ?? ""),
    description: `Restocked drug ${body.drugId}: ${qty} units into batch "${body.batchNumber}"`,
  });

  const { data: batch } = await ctx.svc
    .from("pharmacy_stock_batches")
    .select("id, quantity_on_hand, expiry_date")
    .eq("id", batchId)
    .maybeSingle();

  return ok({ batchId, quantityOnHand: batch?.quantity_on_hand ?? qty, expiryDate: batch?.expiry_date ?? body.expiry });
});

export const runtime = "nodejs";