import { withAuth, ok, requireTenant, ValidationError } from "@/lib/api-utils";
import { isDrugForm, FORM_OPTIONS } from "@/lib/pharmacy-admin";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/pharmacy/admin/import
// Bulk upload a drug catalogue from a CSV document.
//
// Body: { csv: string, skipExisting?: boolean, conflictAction?: "replace"|"keep",
//         defaultCategory?: string, dryRun?: boolean }
//
// CSV contract (first row = headers; quote-aware parser):
//   name*, category*, form*                  (required)
//   generic / generic_name, brand, dosage,
//   sku, wholesale / wholesale_price, price / unit_price,
//   reorder_level, reorder_qty, requires_rx, nafdac / nafdac_number,
//   supplier / supplier_name                 (optional, exact tenant supplier name)
//
// Conflict handling (rows whose name already exists in the catalogue):
//   replace  -> the existing drug is updated in place with the CSV values
//   keep     -> the existing drug is left untouched (counted in `skipped`)
// The legacy `skipExisting: true` is an alias for conflictAction "keep".
//
// dryRun: validate + match against the catalogue and return `{ total, existing,
//   errors }` WITHOUT writing anything — the client uses it to prompt the user
//   before a replace run.
//
// Rules: max 1000 data rows; a row is skipped (with reason) if it repeats a
// name already seen in the file; duplicates by case-insensitive name never
// create a second drug (the DB normalized unique index is the last line of
// defence, and the existing-name lookup is chunked so large files never trip
// the uq_pharmacy_drug unique constraint at insert).
//
// Response: { total, created, updated, skipped, existing, errors: [{ row, reason }] }
// ============================================================================

const MAX_ROWS = 1000;
const HEADER_ALIASES: Record<string, string> = {
  name: "name",
  drug: "name",
  medication: "name",
  "medication name": "name",
  generic: "generic_name",
  "generic name": "generic_name",
  generic_name: "generic_name",
  brand: "brand",
  category: "category",
  form: "form",
  dosage: "dosage",
  "dosage form": "dosage",
  sku: "sku",
  wholesale: "wholesale_price",
  wholesale_price: "wholesale_price",
  price: "unit_price",
  "unit price": "unit_price",
  unit_price: "unit_price",
  "retail price": "unit_price",
  reorder_level: "reorder_level",
  reorder_qty: "reorder_qty",
  requires_rx: "requires_rx",
  nafdac: "nafdac_number",
  nafdac_number: "nafdac_number",
  supplier: "supplier",
  supplier_name: "supplier",
  supplier_name_alt: "supplier",
  "supplier name": "supplier",
  suppliers: "supplier",
  "suppliers name": "supplier",
  vendor: "supplier",
  vendor_name: "supplier",
  "vendor name": "supplier",
  vendors: "supplier",
  manufacturer: "supplier",
  distributor: "supplier",
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell); cell = "";
    } else if (c === "\n") {
      row.push(cell); cell = "";
      if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) rows.push(row);
      row = [];
    } else if (c === "\r") {
      // swallow; \r\n handled by the \n branch
    } else {
      cell += c;
    }
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

function parseBool(v: string | undefined): boolean | undefined {
  if (v === undefined || v.trim() === "") return undefined;
  return ["1", "true", "yes", "y"].includes(v.trim().toLowerCase());
}

export const POST = withAuth(
  async (req, ctx) => {
    const tenantId = requireTenant(ctx);
    const body = await req.json().catch(() => null);
    if (!body) throw new ValidationError("Invalid JSON body");
    const csv = typeof body.csv === "string" ? body.csv : "";
    if (!csv.trim()) throw new ValidationError("csv is required");
    const skipExisting = body.skipExisting === true;
    const defaultCategory = typeof body.defaultCategory === "string" && body.defaultCategory.trim() ? body.defaultCategory.trim() : undefined;

    // 1. parse + header map
    const raw = parseCsv(csv);
    if (raw.length < 2) throw new ValidationError("CSV must contain a header row and at least one data row");
    const header = raw[0].map((h) => (HEADER_ALIASES[h.trim().toLowerCase()] ?? "").trim());
    const col = (rowIdx: number, key: string): string => {
      const idx = header.indexOf(key);
      if (idx === -1) return "";
      return (raw[rowIdx][idx] ?? "").trim();
    };
    if (!header.includes("name")) throw new ValidationError('CSV must have a "name" column');

    // 2. per-row validation
    interface Row { row: number; name: string; normalized: string; columns: Record<string, unknown>; supplierName: string | null; }
    const parsedRows: Row[] = [];
    const errors: Array<{ row: number; reason: string }> = [];
    const seen = new Map<string, number>(); // normalized name -> first row

    for (let i = 1; i < raw.length && i <= MAX_ROWS; i++) {
      const name = col(i, "name");
      if (!name) { errors.push({ row: i + 1, reason: "missing name" }); continue; }
      const normalized = name.toLowerCase();
      if (seen.has(normalized)) {
        errors.push({ row: i + 1, reason: `duplicate in file — first seen on row ${seen.get(normalized)}` });
        continue;
      }
      seen.set(normalized, i + 1);

      const form = col(i, "form");
      if (!form) { errors.push({ row: i + 1, reason: "missing form" }); continue; }
      if (!isDrugForm(form)) {
        errors.push({ row: i + 1, reason: `invalid form "${form}" (must be one of: ${FORM_OPTIONS.join(", ")})` });
        continue;
      }

      const num = (v: string): number | undefined => {
        if (!v) return undefined;
        const n = Number(v.replace(/,/g, ""));
        return Number.isFinite(n) ? n : undefined;
      };
      const wholesalePrice = num(col(i, "wholesale_price"));
      const unitPrice = num(col(i, "unit_price"));
      if (col(i, "wholesale_price") && wholesalePrice === undefined) { errors.push({ row: i + 1, reason: "wholesale price is not a number" }); continue; }
      if (col(i, "unit_price") && unitPrice === undefined) { errors.push({ row: i + 1, reason: "price is not a number" }); continue; }
      if (wholesalePrice !== undefined && wholesalePrice < 0) { errors.push({ row: i + 1, reason: "wholesale price must be >= 0" }); continue; }
      if (unitPrice !== undefined && unitPrice < 0) { errors.push({ row: i + 1, reason: "price must be >= 0" }); continue; }

      parsedRows.push({
        row: i + 1,
        name,
        normalized,
        columns: {
          name,
          generic_name: col(i, "generic_name") || null,
          brand: col(i, "brand") || null,
          category: col(i, "category") || defaultCategory || "General",
          form,
          dosage: col(i, "dosage") || null,
          sku: col(i, "sku") || null,
          wholesale_price: wholesalePrice ?? 0,
          unit_price: unitPrice ?? 0,
          reorder_level: num(col(i, "reorder_level")) ?? 10,
          reorder_qty: num(col(i, "reorder_qty")) ?? 100,
          requires_rx: parseBool(col(i, "requires_rx")) ?? true,
          nafdac_number: col(i, "nafdac_number") || null,
        },
        supplierName: col(i, "supplier") || null,
      });
    }

    // 2b. tenant supplier lookup for the optional `supplier` column
    const { data: tenantSuppliers } = await ctx.svc
      .from("pharmacy_suppliers")
      .select("id, name")
      .eq("tenant_id", tenantId);
    const supplierByNorm = new Map<string, string>();
    for (const s of (tenantSuppliers ?? []) as Array<{ id: string; name: string }>) {
      supplierByNorm.set(s.name.toLowerCase().trim(), s.id);
    }

    // 3. match + upsert — chunk the existing-name lookup so huge files never
    //    blow past PostgREST URL limits (a failed lookup previously made every
    //    row look "new" and the bulk insert tripped uq_pharmacy_drug).
    const names = parsedRows.map((r) => r.name.toLowerCase());
    const byNorm = new Map<string, string>();
    const CHUNK = 100;
    for (let i = 0; i < names.length; i += CHUNK) {
      const slice = names.slice(i, i + CHUNK);
      const { data: existingRows, error: qErr } = await ctx.svc
        .from("pharmacy_drugs")
        .select("id, name_normalized")
        .eq("tenant_id", tenantId)
        .in("name_normalized", slice);
      if (qErr) throw new ValidationError(`existing-drug lookup failed: ${qErr.message}`);
      for (const e of (existingRows ?? []) as Array<{ name_normalized: string; id: string }>) {
        byNorm.set(e.name_normalized, e.id);
      }
    }

    const existing = parsedRows.filter((r) => byNorm.has(r.name.toLowerCase())).length;

    // dry-run: count matches, write nothing (client prompts before replacing)
    if (body.dryRun === true) {
      return ok({ total: raw.length - 1, existing, errors }, 200);
    }

    const conflictAction =
      body.conflictAction === "replace" ? "replace"
      : body.conflictAction === "keep" || skipExisting === true ? "keep"
      : "replace";

    let created = 0, updated = 0, skipped = 0;
    const insertList: any[] = [];
    for (const r of parsedRows) {
      const columns = { ...r.columns };
      if (r.supplierName) {
        const supplierId = supplierByNorm.get(r.supplierName.toLowerCase().trim());
        if (!supplierId) {
          errors.push({ row: r.row, reason: `unknown supplier "${r.supplierName}" — add it on the Suppliers tab first` });
          continue;
        }
        columns.supplier_id = supplierId;
      }
      const existingId = byNorm.get(r.name.toLowerCase());
      if (existingId) {
        if (conflictAction === "keep") { skipped++; continue; }
        const { error } = await ctx.svc.from("pharmacy_drugs").update({ ...columns, updated_at: new Date().toISOString() }).eq("id", existingId);
        if (error) errors.push({ row: r.row, reason: `update failed: ${error.message}` });
        else updated++;
      } else {
        insertList.push({ tenant_id: tenantId, ...columns });
      }
    }
    // batched insert (chunked, no-row-orphan)
    const chunkSize = 250;
    for (let i = 0; i < insertList.length; i += chunkSize) {
      const chunk = insertList.slice(i, i + chunkSize);
      const { error } = await ctx.svc.from("pharmacy_drugs").insert(chunk).select("id");
      if (!error) created += chunk.length;
      else errors.push({ row: 0, reason: `bulk insert failed: ${error.message}` });
    }

    return ok({ total: raw.length - 1, created, updated, skipped, existing, errors: errors.slice(0, 400) }, 201);
  },
  { roles: ["hospital_admin"] }
);

export const runtime = "nodejs";