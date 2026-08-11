import { withAuth, withStaff, okPaginated, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PROCUREMENT_TEAM = ["hospital_admin", "super_admin", "pharmacist", "pharmacy_tech"];

// GET /api/pharmacy/procurement/purchase-orders?status=&supplier_id=&from=&to=&q=&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const status = resolveParam(req.nextUrl.searchParams.get("status"));
  const supplierId = resolveParam(req.nextUrl.searchParams.get("supplier_id"));
  const dateFrom = resolveParam(req.nextUrl.searchParams.get("from"));
  const dateTo = resolveParam(req.nextUrl.searchParams.get("to"));
  const q = resolveParam(req.nextUrl.searchParams.get("q"))?.trim();

  let query = ctx.svc
    .from("pharmacy_purchase_orders")
    .select(
      `id, po_number, supplier_id, branch_id, status, total_cost, notes, expected_by, approved_by, approved_at, received_at, created_by, created_at,
       pharmacy_suppliers(name),
       pharmacy_purchase_order_items(id, drug_id, quantity_ordered, quantity_received, unit_cost, received_cost)`,
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);
  if (supplierId) query = query.eq("supplier_id", supplierId);
  if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00`);
  if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59`);
  if (q) query = query.or(`po_number.ilike.%${q}%`);

  const { data, count } = await query;
  return okPaginated(
    (data ?? []).map((po: any) => ({
      id: po.id,
      poNumber: po.po_number,
      supplierId: po.supplier_id,
      supplierName: po.pharmacy_suppliers?.name ?? "—",
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
        quantityOrdered: i.quantity_ordered,
        quantityReceived: i.quantity_received,
        unitCost: Number(i.unit_cost),
        receivedCost: Number(i.received_cost),
      })),
    })),
    count ?? 0,
    page,
    pageSize
  );
});

interface CreatePoItem {
  drugId: string;
  quantity: number;
  unitCost: number;
  notes?: string;
}

// POST /api/pharmacy/procurement/purchase-orders — create a draft PO
export const POST = withAuth(
  async (req, ctx) => {
    const tenantId = requireTenant(ctx);
    const body = (await req.json()) as {
      supplierId: string;
      items: CreatePoItem[];
      notes?: string;
      expectedBy?: string;
    };

    if (!body.supplierId) throw new ValidationError("Supplier is required");
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new ValidationError("At least one drug line is required");
    }
    for (const item of body.items) {
      if (!item.drugId) throw new ValidationError("Every order line needs a drug");
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new ValidationError("Every order line needs a positive whole quantity");
      }
      if (Number(item.unitCost) < 0) {
        throw new ValidationError("Unit cost cannot be negative");
      }
    }

    const { data: poId, error } = await ctx.svc.rpc("pharmacy_po_create", {
      p_tenant_id: tenantId,
      p_supplier: body.supplierId,
      p_branch: ctx.branchId ?? "",
      p_items: body.items.map((i) => ({
        drug_id: i.drugId,
        quantity: i.quantity,
        unit_cost: Number(i.unitCost),
        notes: i.notes?.trim() || null,
      })),
      p_notes: body.notes?.trim() || null,
      p_expected_by: body.expectedBy || null,
      p_created_by: ctx.user.id,
    });
    if (error) throw new ValidationError(error.message);

    await logAudit(req, ctx, {
      action: "create",
      entityType: "pharmacy_purchase_orders",
      entityId: String(poId),
      description: `Created purchase order for ${body.items.length} drug line(s)`,
    });
    return ok({ id: poId }, 201);
  },
  { roles: PROCUREMENT_TEAM as any }
);

export const runtime = "nodejs";
