import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/pharmacy/dispense — automatic FEFO dispensing for non-prescription
// stock issues (cash sales, ward requisitions). Splits across the earliest
// expiring batches, refuses expired stock, and is race-safe (transactional).
// For prescription dispensing use POST /api/prescriptions/[id]/dispense.
// Body: { drugId, branchId?, quantity, sourceRef?, notes? }
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as {
    drugId?: string;
    branchId?: string | null;
    quantity?: number;
    sourceRef?: string | null;
    notes?: string | null;
  };

  if (!body.drugId) throw new ValidationError("drugId is required");
  const qty = Math.floor(Number(body.quantity) || 0);
  if (qty <= 0) throw new ValidationError("quantity must be positive");

  const { data: allocations, error } = await ctx.svc.rpc("pharmacy_dispense", {
    p_tenant_id: tenantId,
    p_drug: body.drugId,
    p_branch: body.branchId ?? null,
    p_qty: qty,
    p_source_ref: body.sourceRef?.trim() || null,
    p_created_by: ctx.user.id,
    p_notes: body.notes?.trim() || null,
  });
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "pharmacy_stock_batches",
    entityId: body.drugId,
    description: `Dispensed ${qty} units of drug ${body.drugId} (FEFO, ${allocations} batch allocation(s))`,
  });

  return ok({ allocations: Number(allocations ?? 0), quantity: qty, drugId: body.drugId });
});

export const runtime = "nodejs";