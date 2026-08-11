import { withStaff, ok, NotFoundError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/procurement/purchase-orders/[id] — PO detail incl. GRNs
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;

  const { data: po, error } = await ctx.svc
    .from("pharmacy_purchase_orders")
    .select(
      `id, po_number, supplier_id, branch_id, status, total_cost, notes, expected_by, approved_by, approved_at, received_at, created_by, created_at,
       pharmacy_suppliers(name, code, phone, email, address),
       pharmacy_purchase_order_items(id, drug_id, quantity_ordered, quantity_received, unit_cost, received_cost, notes, pharmacy_drugs(name, category)),
       pharmacy_goods_received_notes(id, grn_number, received_by, notes, received_at, pharmacy_grn_items(id, drug_id, quantity_received, quantity_ordered, unit_cost, batch_number, expiry_date, notes, pharmacy_drugs(name)))`
    )
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !po) throw new NotFoundError("Purchase order not found");

  return ok({
    id: po.id,
    poNumber: po.po_number,
    supplierId: po.supplier_id,
    supplier: po.pharmacy_suppliers,
    status: po.status,
    totalCost: Number(po.total_cost),
    notes: po.notes,
    expectedBy: po.expected_by,
    approvedAt: po.approved_at,
    receivedAt: po.received_at,
    createdBy: po.created_by,
    createdAt: po.created_at,
    items: (po.pharmacy_purchase_order_items ?? []).map((i: any) => ({
      id: i.id,
      drugId: i.drug_id,
      drugName: i.pharmacy_drugs?.name ?? "—",
      quantityOrdered: i.quantity_ordered,
      quantityReceived: i.quantity_received,
      unitCost: Number(i.unit_cost),
      receivedCost: Number(i.received_cost),
      notes: i.notes,
    })),
    grns: (po.pharmacy_goods_received_notes ?? []).map((g: any) => ({
      id: g.id,
      grnNumber: g.grn_number,
      receivedAt: g.received_at,
      notes: g.notes,
      items: (g.pharmacy_grn_items ?? []).map((gi: any) => ({
        id: gi.id,
        drugName: gi.pharmacy_drugs?.name ?? "—",
        quantityReceived: gi.quantity_received,
        unitCost: Number(gi.unit_cost),
        batchNumber: gi.batch_number,
        expiryDate: gi.expiry_date,
        notes: gi.notes,
      })),
    })),
  });
});

export const runtime = "nodejs";
