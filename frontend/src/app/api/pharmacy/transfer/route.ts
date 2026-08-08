import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/pharmacy/transfer
// Body: { drugId, fromBranchId?, toBranchId?, quantity, notes? }
// FEFO-deducts from the source branch, creates/appends the sibling batch in
// the destination branch, both legs ledgered (transfer_out / transfer_in).
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as {
    drugId?: string;
    fromBranchId?: string | null;
    toBranchId?: string | null;
    quantity?: number;
    notes?: string | null;
  };

  if (!body.drugId) throw new ValidationError("drugId is required");
  if (body.fromBranchId === body.toBranchId) {
    throw new ValidationError("source and destination branches must differ");
  }
  const qty = Math.floor(Number(body.quantity) || 0);
  if (qty <= 0) throw new ValidationError("quantity must be positive");

  const { data: written, error } = await ctx.svc.rpc("pharmacy_transfer", {
    p_tenant_id: tenantId,
    p_drug: body.drugId,
    p_from_branch: body.fromBranchId ?? null,
    p_to_branch: body.toBranchId ?? null,
    p_qty: qty,
    p_created_by: ctx.user.id,
    p_notes: body.notes?.trim() || null,
  });
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "pharmacy_stock_batches",
    entityId: body.drugId,
    description: `Transferred ${qty} units of drug ${body.drugId} (${body.fromBranchId ?? "central"} -> ${body.toBranchId ?? "central"})`,
  });

  return ok({ allocations: Number(written ?? 0), quantity: qty });
});

export const runtime = "nodejs";