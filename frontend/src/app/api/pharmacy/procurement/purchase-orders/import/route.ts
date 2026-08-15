import { withAuth, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PROCUREMENT_TEAM = ["hospital_admin", "super_admin", "pharmacist", "pharmacy_tech"];

// POST /api/pharmacy/procurement/purchase-orders/import — create ONE draft PO
// from a bulk file of drug lines. Drug names are matched case-insensitively
// against the tenant's catalog; unknown names become error rows and the rest
// still goes through (single order, no partial POs).
export const POST = withAuth(
  async (req, ctx) => {
    const tenantId = requireTenant(ctx);
    const body = (await req.json()) as {
      supplierId?: string;
      rows?: Array<{ drugName?: string; quantity?: number; unitCost?: number; notes?: string }>;
      notes?: string;
      expectedBy?: string;
    };
    if (!body.supplierId) throw new ValidationError("Supplier is required");
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      throw new ValidationError("At least one drug line is required");
    }

    const { data: supplier } = await ctx.svc
      .from("pharmacy_suppliers")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("id", body.supplierId)
      .maybeSingle();
    if (!supplier) throw new ValidationError("Supplier not found in this hospital");

    const errors: { row: number; message: string }[] = [];
    const items: Array<{ drug_id: string; quantity: number; unit_cost: number; notes: string | null }> = [];

    for (let i = 0; i < body.rows.length; i++) {
      const r = body.rows[i] ?? {};
      const rowNo = i + 2; // 1-indexed including the header row
      const drugName = r.drugName?.trim();
      if (!drugName) {
        errors.push({ row: rowNo, message: "Drug name is required" });
        continue;
      }
      const quantity = r.quantity;
      if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
        errors.push({ row: rowNo, message: `Quantity for "${drugName}" must be a positive whole number` });
        continue;
      }
      if (Number(r.unitCost ?? 0) < 0) {
        errors.push({ row: rowNo, message: `Unit cost for "${drugName}" cannot be negative` });
        continue;
      }

      const { data: drug } = await ctx.svc
        .from("pharmacy_drugs")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .ilike("name", drugName)
        .maybeSingle();
      if (!drug) {
        errors.push({ row: rowNo, message: `Unknown drug "${drugName}" — check the catalog name` });
        continue;
      }
      items.push({
        drug_id: drug.id,
        quantity,
        unit_cost: Number(r.unitCost ?? 0),
        notes: r.notes?.trim() || null,
      });
    }

    if (items.length === 0) {
      throw new ValidationError(
        `No valid drug lines — ${errors.length} row(s) failed (first: ${errors[0]?.message})`
      );
    }

    const { data: poId, error } = await ctx.svc.rpc("pharmacy_po_create", {
      p_tenant_id: tenantId,
      p_supplier: body.supplierId,
      p_branch: ctx.branchId ?? "",
      p_items: items,
      p_notes: body.notes?.trim() || null,
      p_expected_by: body.expectedBy || null,
      p_created_by: ctx.user.id,
    });
    if (error) throw new ValidationError(error.message);

    await logAudit(req, ctx, {
      action: "create",
      entityType: "pharmacy_purchase_orders",
      entityId: String(poId),
      description: `Bulk-imported purchase order for ${supplier.name}: ${items.length} line(s), ${errors.length} row(s) failed`,
    });

    return ok({ id: poId, supplierName: supplier.name, rowsCreated: items.length, errors }, 201);
  },
  { roles: PROCUREMENT_TEAM as any }
);

export const runtime = "nodejs";