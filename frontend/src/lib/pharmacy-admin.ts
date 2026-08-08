// ============================================================================
// PHARMACY ADMIN — shared constants + validation for the admin extension.
//
// Validation rules (documented contract for the admin routes):
//   name           required, 2..200 chars after trim; case/space-insensitive
//                  unique per tenant (DB enforces via name_normalized).
//   category       required, 1..80 chars; free text — unknown categories are
//                  auto-registered to the tenant's category list.
//   form           required, must be one of FORM_OPTIONS (mirrors the 0023
//                  CHECK constraint).
//   unit_price / wholesale_price   >= 0;  unit_price is the retail price.
//   reorder_level / reorder_qty    integer >= 0.
//   sku                            <= 100 chars (optional).
//   nafdac_number                   <= 50 chars (optional).
//   requires_rx / is_controlled     boolean (optional, default true / false).
// ============================================================================

export const FORM_OPTIONS = [
  "tablet", "capsule", "softgel", "caplet", "syrup", "suspension", "injection",
  "infusion", "inhaler", "nebule", "cream", "gel", "ointment", "suppository",
  "pessary", "sachet", "powder", "solution", "shampoo", "bottle", "solution_vial",
] as const;

export type DrugForm = (typeof FORM_OPTIONS)[number];

export function isDrugForm(v: string): v is DrugForm {
  return (FORM_OPTIONS as readonly string[]).includes(v);
}

export interface DrugInput {
  name: string;
  category: string;
  form: string;
  genericName?: string | null;
  brand?: string | null;
  dosage?: string | null;
  sku?: string | null;
  wholesalePrice?: number;
  unitPrice?: number;
  reorderLevel?: number;
  reorderQty?: number;
  requiresRx?: boolean;
  isControlled?: boolean;
  nafdacNumber?: string | null;
  branchId?: string | null;
}

/** Returns a cleaned DrugInput or a list of validation errors. */
export function validateDrugInput(body: Record<string, unknown>): { ok: true; value: DrugInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;

  const name = str(body.name);
  if (!name) errors.push("name is required");
  else if (name.length > 200) errors.push("name must be 200 characters or fewer");

  const category = str(body.category);
  if (!category) errors.push("category is required");
  else if (category.length > 80) errors.push("category must be 80 characters or fewer");

  const form = str(body.form);
  if (!form) errors.push("form is required");
  else if (!isDrugForm(form)) errors.push(`form must be one of: ${FORM_OPTIONS.join(", ")}`);

  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;

  const numGE0 = (v: unknown, label: string): number | undefined => {
    const n = num(v);
    if (n === undefined) return undefined;
    if (n < 0) { errors.push(`${label} must be 0 or greater`); return undefined; }
    return Math.round(n * 100) / 100;
  };

  const wholesalePrice = numGE0(body.wholesalePrice, "wholesalePrice");
  const unitPrice = numGE0(body.unitPrice, "unitPrice");

  const reorderLevel = num(body.reorderLevel);
  if (reorderLevel !== undefined && (!Number.isInteger(reorderLevel) || reorderLevel < 0)) {
    errors.push("reorderLevel must be a non-negative integer");
  }
  const reorderQty = num(body.reorderQty);
  if (reorderQty !== undefined && (!Number.isInteger(reorderQty) || reorderQty < 0)) {
    errors.push("reorderQty must be a non-negative integer");
  }

  const sku = str(body.sku);
  if (sku && sku.length > 100) errors.push("sku must be 100 characters or fewer");
  const nafdacNumber = str(body.nafdacNumber);
  if (nafdacNumber && nafdacNumber.length > 50) errors.push("nafdacNumber must be 50 characters or fewer");

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name: name!,
      category: category!,
      form: form!,
      genericName: str(body.genericName) ?? null,
      brand: str(body.brand) ?? null,
      dosage: str(body.dosage) ?? null,
      sku: sku ?? null,
      wholesalePrice,
      unitPrice,
      reorderLevel,
      reorderQty,
      requiresRx: typeof body.requiresRx === "boolean" ? body.requiresRx : true,
      isControlled: typeof body.isControlled === "boolean" ? body.isControlled : false,
      nafdacNumber: nafdacNumber ?? null,
      branchId: typeof body.branchId === "string" && body.branchId ? body.branchId : null,
    },
  };
}

/** Map an update payload to the whitelisted DB columns for PATCH. */
export function drugUpdateColumns(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const cols: Array<[string, string]> = [
    ["name", "name"],
    ["genericName", "generic_name"],
    ["brand", "brand"],
    ["category", "category"],
    ["form", "form"],
    ["dosage", "dosage"],
    ["sku", "sku"],
    ["wholesalePrice", "wholesale_price"],
    ["unitPrice", "unit_price"],
    ["reorderLevel", "reorder_level"],
    ["reorderQty", "reorder_qty"],
    ["requiresRx", "requires_rx"],
    ["isControlled", "is_controlled"],
    ["nafdacNumber", "nafdac_number"],
    ["isActive", "is_active"],
    ["branchId", "branch_id"],
  ];
  for (const [key, col] of cols) {
    if (body[key] !== undefined) out[col] = body[key];
  }
  return out;
}