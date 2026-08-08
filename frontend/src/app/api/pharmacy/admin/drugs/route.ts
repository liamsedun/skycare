import { withStaff, withAuth, ok, okPaginated, requireTenant, resolveParam, ValidationError } from "@/lib/api-utils";
import { validateDrugInput } from "@/lib/pharmacy-admin";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/pharmacy/admin/drugs?search=&category=&branch=&page=&pageSize=&includeInactive=1
// Admin catalogue list: stock-on-hand + effective (overridden) price.
// ---------------------------------------------------------------------------
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const search = (resolveParam(req.nextUrl.searchParams.get("search")) ?? "").trim().toLowerCase();
  const category = resolveParam(req.nextUrl.searchParams.get("category"));
  const page = Math.max(1, Number(resolveParam(req.nextUrl.searchParams.get("page")) ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(resolveParam(req.nextUrl.searchParams.get("pageSize")) ?? 20) || 20));
  const includeInactive = resolveParam(req.nextUrl.searchParams.get("includeInactive")) === "1";

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = ctx.svc
    .from("pharmacy_drugs")
    .select("id, tenant_id, branch_id, name, generic_name, brand, category, form, dosage, sku, wholesale_price, unit_price, reorder_level, reorder_qty, requires_rx, is_controlled, nafdac_number, is_active, created_at, updated_at", { count: "exact" })
    .eq("tenant_id", tenantId);
  if (!includeInactive) q = q.eq("is_active", true);
  if (category) q = q.eq("category", category);
  if (search) {
    q = q.or(`name_normalized.ilike.%${search}%,generic_name.ilike.%${search}%,brand.ilike.%${search}%,sku.ilike.%${search}%`);
  }
  q = q.order("name", { ascending: true }).range(from, to);
  const { data, error, count } = await q;
  if (error) return ok({ data: [], total: 0, page, pageSize }, 500);

  const rows = (data ?? []) as any[];
  const ids = rows.map((d) => d.id);

  const [batchesRes, overridesRes] = await Promise.all([
    ids.length > 0
      ? ctx.svc.from("pharmacy_stock_batches").select("drug_id, quantity_on_hand, expiry_date").in("drug_id", ids)
      : Promise.resolve({ data: [] as any[] }),
    ids.length > 0
      ? ctx.svc.from("pharmacy_price_overrides").select("drug_id, unit_price").in("drug_id", ids)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const stockByDrug = new Map<string, number>();
  for (const b of (batchesRes.data ?? []) as Array<{ drug_id: string; quantity_on_hand: number; expiry_date: string }>) {
    if ((b.expiry_date ?? "") >= today) {
      stockByDrug.set(b.drug_id, (stockByDrug.get(b.drug_id) ?? 0) + (b.quantity_on_hand ?? 0));
    }
  }

  const overridePrice = new Map<string, number>();
  for (const o of (overridesRes.data ?? []) as Array<{ drug_id: string; unit_price: number }>) {
    if (!overridePrice.has(o.drug_id)) overridePrice.set(o.drug_id, o.unit_price);
  }

  const mapped = rows.map((d) => ({
    id: d.id,
    name: d.name,
    genericName: d.generic_name,
    brand: d.brand,
    category: d.category,
    form: d.form,
    dosage: d.dosage,
    sku: d.sku,
    wholesalePrice: Number(d.wholesale_price ?? 0),
    unitPrice: Number(d.unit_price ?? 0),
    effectivePrice: Number(overridePrice.get(d.id) ?? d.unit_price ?? 0),
    reorderLevel: d.reorder_level,
    reorderQty: d.reorder_qty,
    requiresRx: d.requires_rx,
    isControlled: d.is_controlled,
    nafdacNumber: d.nafdac_number,
    isActive: d.is_active,
    branchId: d.branch_id,
    stock: stockByDrug.get(d.id) ?? 0,
  }));

  return okPaginated(mapped, count ?? 0, page, pageSize);
});

// ---------------------------------------------------------------------------
// POST /api/pharmacy/admin/drugs — create a drug (admin only)
// ---------------------------------------------------------------------------
export const POST = withAuth(
  async (req, ctx) => {
    const tenantId = requireTenant(ctx);
    const body = await req.json().catch(() => null);
    if (!body) throw new ValidationError("Invalid JSON body");

    const check = validateDrugInput(body);
    if (!check.ok) throw new ValidationError(check.errors.join("; "));

    const v = check.value;
    const { data: dup } = await ctx.svc
      .from("pharmacy_drugs")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("name_normalized", v.name.toLowerCase())
      .maybeSingle();
    if (dup) throw new ValidationError(`A drug already exists with this name: "${dup.name}"`);

    const { data, error } = await ctx.svc
      .from("pharmacy_drugs")
      .insert({
        tenant_id: tenantId,
        branch_id: v.branchId,
        name: v.name,
        generic_name: v.genericName,
        brand: v.brand,
        category: v.category,
        form: v.form,
        dosage: v.dosage,
        sku: v.sku,
        wholesale_price: v.wholesalePrice ?? 0,
        unit_price: v.unitPrice ?? 0,
        reorder_level: v.reorderLevel ?? 10,
        reorder_qty: v.reorderQty ?? 100,
        requires_rx: v.requiresRx ?? true,
        is_controlled: v.isControlled ?? false,
        nafdac_number: v.nafdacNumber,
      })
      .select()
      .single();
    if (error) {
      if (String(error.message).includes("uq_pharmacy_drugs_name_norm")) {
        throw new ValidationError(`A drug already exists with this name: "${v.name}"`);
      }
      throw new ValidationError(error.message);
    }
    return ok(data, 201);
  },
  { roles: ["hospital_admin", "super_admin"] }
);

export const runtime = "nodejs";