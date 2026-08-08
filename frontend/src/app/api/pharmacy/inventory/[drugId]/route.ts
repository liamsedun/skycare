import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const TODAY = new Date().toISOString().slice(0, 10);

// GET /api/pharmacy/inventory/[drugId] — batch-level drill-down: every batch
// for the drug (expired ones flagged), plus the most recent ledger entries.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const drugId = req.nextUrl.pathname.split("/").at(-1)!;

  const { data: drug, error: drugError } = await ctx.svc
    .from("pharmacy_drugs")
    .select("id, name, generic_name, brand, category, form, dosage, unit_price, wholesale_price, reorder_level, reorder_qty")
    .eq("id", drugId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (drugError || !drug) throw new NotFoundError("Drug not found");

  const [batchesRes, movementsRes] = await Promise.all([
    ctx.svc
      .from("pharmacy_stock_batches")
      .select("id, branch_id, batch_number, expiry_date, quantity_on_hand, cost_price, location, supplier_id, received_at, created_at")
      .eq("drug_id", drugId)
      .order("expiry_date", { ascending: true }),
    ctx.svc
      .from("pharmacy_stock_movements")
      .select("id, batch_id, branch_id, type, quantity, source_ref, notes, created_by, created_at")
      .eq("drug_id", drugId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if (batchesRes.error) throw new ValidationError(batchesRes.error.message);
  if (movementsRes.error) throw new ValidationError(movementsRes.error.message);

  const totalStockAll = (batchesRes.data ?? []).reduce((s, b) => s + (b.quantity_on_hand ?? 0), 0);
  const validStock = (batchesRes.data ?? []).reduce(
    (s, b) => s + ((b.expiry_date ?? "") >= TODAY ? (b.quantity_on_hand ?? 0) : 0),
    0
  );

  const branches = new Map<string | null, string>();
  const branchIds = Array.from(new Set((batchesRes.data ?? []).map((b) => b.branch_id).filter(Boolean))) as string[];
  if (branchIds.length > 0) {
    const { data } = await ctx.svc.from("branches").select("id, name").in("id", branchIds);
    for (const b of data ?? []) branches.set(b.id, b.name);
  }

  return ok({
    drug: {
      id: drug.id,
      name: drug.name,
      genericName: drug.generic_name,
      brand: drug.brand,
      category: drug.category,
      form: drug.form,
      dosage: drug.dosage,
      unitPrice: Number(drug.unit_price ?? 0),
      wholesalePrice: Number(drug.wholesale_price ?? 0),
      reorderLevel: drug.reorder_level ?? 0,
      reorderQty: drug.reorder_qty ?? 100,
    },
    totals: { stock: totalStockAll, dispensableStock: validStock, expiredUnits: totalStockAll - validStock },
    batches: (batchesRes.data ?? []).map((b) => ({
      id: b.id,
      batchNumber: b.batch_number,
      branchId: b.branch_id,
      branchName: branches.get(b.branch_id) ?? (b.branch_id === null ? "Central" : null),
      expiryDate: b.expiry_date,
      status: (b.expiry_date ?? "") < TODAY ? ("expired" as const) : ("ok" as const),
      quantityOnHand: b.quantity_on_hand ?? 0,
      costPrice: Number(b.cost_price ?? 0),
      location: b.location,
      supplierId: b.supplier_id,
      receivedAt: b.received_at,
    })),
    movements: (movementsRes.data ?? []).map((m) => ({
      id: m.id,
      type: m.type,
      quantity: m.quantity,
      branchId: m.branch_id,
      sourceRef: m.source_ref,
      notes: m.notes,
      createdBy: m.created_by,
      createdAt: m.created_at,
    })),
  });
});

export const runtime = "nodejs";