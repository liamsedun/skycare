import { withAuth, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PROCUREMENT_TEAM = ["hospital_admin", "pharmacist", "pharmacy_tech"];

interface ReceiveItem {
  poItemId: string;
  quantityReceived: number;
  batchNumber: string;
  expiryDate?: string;
  actualCost?: number;
  notes?: string;
}

// POST /api/pharmacy/procurement/purchase-orders/[id]/receive
// { items: [{poItemId, quantityReceived, batchNumber, expiryDate?, actualCost?}], notes? }
// Runs the GRN engine: creates the goods received note, stock batches and
// movements; closes the PO when fully received.
export const POST = withAuth(
  async (req, ctx) => {
    const tenantId = requireTenant(ctx);
    const id = req.nextUrl.pathname.split("/").filter(Boolean).slice(-2)[0]!;
    const body = (await req.json()) as { items?: ReceiveItem[]; notes?: string };

    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new ValidationError("At least one received item is required");
    }
    for (const item of body.items) {
      if (!item.poItemId) throw new ValidationError("poItemId is required on every received line");
      if (!Number.isInteger(item.quantityReceived) || item.quantityReceived <= 0) {
        throw new ValidationError("quantityReceived must be a positive whole number");
      }
      if (!item.batchNumber?.trim()) {
        throw new ValidationError("A batch number is required for every received line");
      }
    }

    const { data: grnId, error } = await ctx.svc.rpc("pharmacy_grn_receive", {
      p_tenant_id: tenantId,
      p_po_id: id,
      p_user_id: ctx.user.id,
      p_branch: ctx.branchId ?? "",
      p_items: body.items.map((i) => ({
        po_item_id: i.poItemId,
        quantity_received: i.quantityReceived,
        batch_number: i.batchNumber.trim(),
        expiry_date: i.expiryDate || null,
        actual_cost: i.actualCost != null ? Number(i.actualCost) : null,
        notes: i.notes?.trim() || null,
      })),
      p_notes: body.notes?.trim() || null,
    });
    if (error) throw new ValidationError(error.message);

    await logAudit(req, ctx, {
      action: "create",
      entityType: "pharmacy_goods_received_notes",
      entityId: String(grnId),
      description: `Received goods (GRN) against purchase order ${id}`,
    });
    return ok({ grnId }, 201);
  },
  { roles: PROCUREMENT_TEAM as any }
);

export const runtime = "nodejs";
