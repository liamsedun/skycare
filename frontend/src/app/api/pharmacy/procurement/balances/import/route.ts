import { withAuth, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PROCUREMENT_TEAM = ["hospital_admin", "pharmacist", "pharmacy_tech"];

interface BalanceRowInput {
  supplierName?: string;
  totalBought?: string | number;
  totalPaid?: string | number;
  notes?: string;
}

/** Parse a spreadsheet money cell: strips ₦/commas/spaces, empty -> 0. */
function money(v: string | number | undefined): number | null {
  if (v === undefined || v === null) return 0;
  const cleaned = String(v).replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-") return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

// POST /api/pharmacy/procurement/balances/import — seed opening balances
// from a migrated CSV. Supplier names are matched case-insensitively against
// the tenant's supplier list (add missing suppliers on the Suppliers tab
// first); unknown names become error rows. A known supplier's opening
// balance is UPSERTED (re-importing overwrites).
export const POST = withAuth(
  async (req, ctx) => {
    const tenantId = requireTenant(ctx);
    const body = (await req.json()) as { rows?: BalanceRowInput[] };

    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      throw new ValidationError("At least one balance row is required");
    }

    const errors: { row: number; message: string }[] = [];
    const upserts: Array<{
      tenant_id: string;
      supplier_id: string;
      total_bought: number;
      total_paid: number;
      notes: string | null;
      created_by: string;
    }> = [];

    for (let i = 0; i < body.rows.length; i++) {
      const r = body.rows[i] ?? {};
      const rowNo = i + 2; // 1-indexed including the header row
      const name = String(r.supplierName ?? "").trim();
      if (!name) {
        errors.push({ row: rowNo, message: "Supplier name is required" });
        continue;
      }
      const bought = money(r.totalBought);
      const paid = money(r.totalPaid);
      if (bought === null || paid === null) {
        errors.push({ row: rowNo, message: `"${name}" — total bought / total paid must be numbers` });
        continue;
      }
      if (bought < 0 || paid < 0) {
        errors.push({ row: rowNo, message: `"${name}" — totals cannot be negative` });
        continue;
      }

      const { data: supplier } = await ctx.svc
        .from("pharmacy_suppliers")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .ilike("name", name)
        .maybeSingle();
      if (!supplier) {
        errors.push({ row: rowNo, message: `Unknown supplier "${name}" — add it on the Suppliers tab first` });
        continue;
      }
      upserts.push({
        tenant_id: tenantId,
        supplier_id: supplier.id,
        total_bought: Math.round(bought * 100) / 100,
        total_paid: Math.round(paid * 100) / 100,
        notes: r.notes ? String(r.notes).trim() || null : null,
        created_by: ctx.user.id,
      });
    }

    let created = 0;
    let updated = 0;
    if (upserts.length > 0) {
      const ids = upserts.map((u) => u.supplier_id);
      const { data: existing } = await ctx.svc
        .from("pharmacy_supplier_opening_balances")
        .select("supplier_id")
        .eq("tenant_id", tenantId)
        .in("supplier_id", ids);
      const known = new Set((existing ?? []).map((e) => e.supplier_id));
      created = upserts.filter((u) => !known.has(u.supplier_id)).length;
      updated = upserts.length - created;

      const { error } = await ctx.svc
        .from("pharmacy_supplier_opening_balances")
        .upsert(upserts, { onConflict: "tenant_id,supplier_id" });
      if (error) throw new ValidationError(error.message);
    }

    await logAudit(req, ctx, {
      action: "create",
      entityType: "pharmacy_supplier_opening_balances",
      entityId: `bulk/${created}/${updated}`,
      description: `Imported opening balances: ${created} new, ${updated} updated, ${errors.length} row(s) failed`,
    });

    return ok({ imported: upserts.length, created, updated, errors });
  },
  { roles: PROCUREMENT_TEAM as any }
);

export const runtime = "nodejs";