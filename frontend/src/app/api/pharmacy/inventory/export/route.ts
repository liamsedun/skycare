import { withStaff, ValidationError, requireTenant } from "@/lib/api-utils";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;

function escapeCsv(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/pharmacy/inventory/export — bulk CSV export of the whole drug
// inventory (catalogue fields + retail/wholesale/effective pricing + live
// stock totals + reorder points), all branches aggregated. Paginates through
// the catalogue so exports are not capped by REST's per-request row limit.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);

  const drugs: Array<any> = [];
  let page = 0;
  for (;;) {
    const from = page * PAGE_SIZE;
    const { data, error } = await ctx.svc
      .from("pharmacy_drugs")
      .select("id, name, generic_name, brand, category, form, dosage, unit_price, wholesale_price, reorder_level, reorder_qty, sku, requires_rx, is_controlled, nafdac_number, is_active")
      .eq("tenant_id", tenantId)
      .order("name")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new ValidationError(error.message);
    drugs.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
    page += 1;
  }

  const { data: batches, error: batchesError } = await ctx.svc
    .from("pharmacy_stock_batches")
    .select("drug_id, quantity_on_hand")
    .eq("tenant_id", tenantId);
  if (batchesError) throw new ValidationError(batchesError.message);

  const stockByDrug = new Map<string, number>();
  for (const b of batches ?? []) {
    stockByDrug.set(b.drug_id, (stockByDrug.get(b.drug_id) ?? 0) + Number(b.quantity_on_hand ?? 0));
  }

  let overrides: Array<{ drug_id: string; unit_price: number }> = [];
  if (drugs.length > 0) {
    const { data: overrideRes, error: overrideError } = await ctx.svc
      .from("pharmacy_price_overrides")
      .select("drug_id, unit_price")
      .eq("tenant_id", tenantId)
      .in("drug_id", drugs.map((d) => d.id));
    if (overrideError) throw new ValidationError(overrideError.message);
    overrides = overrideRes ?? [];
  }
  const effectivePrice = new Map<string, number>();
  for (const o of overrides) {
    if (!effectivePrice.has(o.drug_id)) effectivePrice.set(o.drug_id, o.unit_price);
  }

  const header = [
    "name", "generic_name", "brand", "category", "form", "dosage", "sku", "nafdac_number",
    "requires_rx", "is_controlled", "is_active", "unit_price", "wholesale_price",
    "effective_price", "reorder_level", "reorder_qty", "stock",
  ];
  const lines = [header.join(",")];
  for (const d of drugs) {
    lines.push(
      [
        d.name,
        d.generic_name,
        d.brand,
        d.category,
        d.form,
        d.dosage,
        d.sku,
        d.nafdac_number,
        d.requires_rx ? "1" : "0",
        d.is_controlled ? "1" : "0",
        d.is_active ? "1" : "0",
        d.unit_price,
        d.wholesale_price,
        effectivePrice.get(d.id) ?? d.unit_price,
        d.reorder_level,
        d.reorder_qty,
        stockByDrug.get(d.id) ?? 0,
      ]
        .map(escapeCsv)
        .join(",")
    );
  }

  const csv = "\uFEFF" + lines.join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="drug-inventory-${new Date().toISOString().slice(0, 10)}.csv"`,
      "X-Row-Count": String(drugs.length),
    },
  });
});

export const runtime = "nodejs";