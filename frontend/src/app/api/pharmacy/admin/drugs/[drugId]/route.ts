import { withStaff, withAuth, ok, NotFoundError, ValidationError, requireTenant, resolveParam } from "@/lib/api-utils";
import { validateDrugInput, drugUpdateColumns } from "@/lib/pharmacy-admin";
import { invalidatePharmacyCatalogCache } from "@/lib/cache";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/admin/drugs/[drugId] — single drug detail (staff)
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const segments = req.nextUrl.pathname.split("/");
  const drugId = segments[segments.length - 1];

  const { data, error } = await ctx.svc.from("pharmacy_drugs").select("*").eq("tenant_id", tenantId).eq("id", drugId).maybeSingle();
  if (error || !data) throw new NotFoundError("Drug not found");

  const { data: batches } = await ctx.svc
    .from("pharmacy_stock_batches")
    .select("id, batch_number, expiry_date, quantity_on_hand, cost_price, location, supplier_id, pharmacy_suppliers(name)")
    .eq("tenant_id", tenantId)
    .eq("drug_id", drugId)
    .order("received_at", { ascending: false });
  const { data: overrides } = await ctx.svc
    .from("pharmacy_price_overrides")
    .select("id, branch_id, unit_price, note, branches(name)")
    .eq("tenant_id", tenantId)
    .eq("drug_id", drugId);

  const mapOverride = (o: any) => ({
    id: o.id,
    branchId: o.branch_id,
    branchName: o.branches?.name ?? "All branches",
    unitPrice: Number(o.unit_price ?? 0),
    note: o.note,
  });

  return ok({
    ...data,
    wholesalePrice: Number(data.wholesale_price ?? 0),
    unitPrice: Number(data.unit_price ?? 0),
    batches: batches ?? [],
    priceOverrides: (overrides ?? []).map(mapOverride),
  });
});

// PATCH /api/pharmacy/admin/drugs/[drugId] — update fields / price / active
export const PATCH = withAuth(
  async (req, ctx) => {
    const tenantId = requireTenant(ctx);
    const segments = req.nextUrl.pathname.split("/");
    const drugId = segments[segments.length - 1];

    const { data: existing } = await ctx.svc.from("pharmacy_drugs").select("id, name, category, form").eq("tenant_id", tenantId).eq("id", drugId).maybeSingle();
    if (!existing) throw new NotFoundError("Drug not found");

    const body = await req.json().catch(() => null);
    if (!body) throw new ValidationError("Invalid JSON body");

    // full-doc validation when the editable core fields are present
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined || body.category !== undefined || body.form !== undefined || body.unitPrice !== undefined || body.wholesalePrice !== undefined || body.reorderLevel !== undefined || body.reorderQty !== undefined) {
      const merged = { ...existing, ...body, name: body.name ?? existing.name, category: body.category ?? (existing as any).category, form: body.form ?? (existing as any).form };
      const check = validateDrugInput(merged);
      if (!check.ok) throw new ValidationError(check.errors.join("; "));
      const v = check.value;
      Object.assign(patch, {
        name: v.name,
        generic_name: v.genericName,
        brand: v.brand,
        category: v.category,
        form: v.form,
        dosage: v.dosage,
        sku: v.sku,
        wholesale_price: v.wholesalePrice,
        unit_price: v.unitPrice,
        reorder_level: v.reorderLevel,
        reorder_qty: v.reorderQty,
        requires_rx: v.requiresRx,
        is_controlled: v.isControlled,
        nafdac_number: v.nafdacNumber,
        supplier_id: v.supplierId,
      });
    } else {
      Object.assign(patch, drugUpdateColumns(body));
      if (patch.supplier_id) {
        const { data: supp } = await ctx.svc.from("pharmacy_suppliers").select("id").eq("tenant_id", tenantId).eq("id", patch.supplier_id).maybeSingle();
        if (!supp) throw new ValidationError("Supplier not found in this hospital");
      }
    }
    delete patch.tenant_id;

    if (patch.name !== undefined && patch.name !== existing.name) {
      const { data: dup } = await ctx.svc
        .from("pharmacy_drugs")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .eq("name_normalized", String(patch.name).toLowerCase())
        .neq("id", drugId)
        .maybeSingle();
      if (dup) throw new ValidationError(`A drug already exists with this name: "${dup.name}"`);
    }

    const { data, error } = await ctx.svc.from("pharmacy_drugs").update({ ...patch, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", drugId).select().single();
    if (error) {
      if (String(error.message).includes("uq_pharmacy_drugs_name_norm")) throw new ValidationError("A drug already exists with this name");
      throw new ValidationError(error.message);
    }
    await invalidatePharmacyCatalogCache(tenantId);
    return ok(data);
  },
  { roles: ["hospital_admin"] }
);

// ---------------------------------------------------------------------------
// DELETE /api/pharmacy/admin/drugs/[drugId]?hard=1 — archive (is_active=false)
// or hard-delete when no stock history exists.
// ---------------------------------------------------------------------------
export const DELETE = withAuth(
  async (req, ctx) => {
    const tenantId = requireTenant(ctx);
    const segments = req.nextUrl.pathname.split("/");
    const drugId = segments[segments.length - 1];
    const hard = resolveParam(req.nextUrl.searchParams.get("hard")) === "1";

    const { data: drug } = await ctx.svc.from("pharmacy_drugs").select("id").eq("tenant_id", tenantId).eq("id", drugId).maybeSingle();
    if (!drug) throw new NotFoundError("Drug not found");

    if (hard) {
      const { count: ties } = await ctx.svc
        .from("pharmacy_stock_movements")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("drug_id", drugId);
      if ((ties ?? 0) > 0) throw new ValidationError("Drug has stock movements — use archive instead");
      const { count: batches } = await ctx.svc.from("pharmacy_stock_batches").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("drug_id", drugId);
      if ((batches ?? 0) > 0) throw new ValidationError("Drug has stock batches — use archive instead");
      const { error } = await ctx.svc.from("pharmacy_drugs").delete().eq("tenant_id", tenantId).eq("id", drugId);
      if (error) throw new ValidationError(error.message);
      await invalidatePharmacyCatalogCache(tenantId);
      return ok({ deleted: true });
    }

    const { error } = await ctx.svc.from("pharmacy_drugs").update({ is_active: false }).eq("tenant_id", tenantId).eq("id", drugId);
    if (error) throw new ValidationError(error.message);
    await invalidatePharmacyCatalogCache(tenantId);
    return ok({ archived: true });
  },
  { roles: ["hospital_admin"] }
);

export const runtime = "nodejs";