import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/controlled-drugs — controlled formulary with physical
// stock (sum of batches) + latest register balance per drug.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);

  const [{ data: drugs, error: de }, { data: batches, error: be }, { data: reg, error: re }] =
    await Promise.all([
      ctx.svc
        .from("pharmacy_drugs")
        .select("id, name, generic_name, category, form, nafdac_number, control_schedule, max_qty_per_dispense, reorder_level, requires_rx, unit_price, is_active")
        .eq("tenant_id", tenantId)
        .eq("is_controlled", true)
        .order("name"),
      ctx.svc
        .from("pharmacy_stock_batches")
        .select("drug_id, branch_id, quantity_on_hand, expiry_date")
        .eq("tenant_id", tenantId),
      ctx.svc
        .from("controlled_drug_register")
        .select("drug_id, balance_after, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);
  if (de || be || re) throw new ValidationError(de?.message ?? be?.message ?? re?.message ?? "Query failed");

  const onHand: Record<string, number> = {};
  for (const b of batches ?? []) {
    onHand[b.drug_id] = (onHand[b.drug_id] ?? 0) + Number(b.quantity_on_hand ?? 0);
  }
  const latestBalance: Record<string, number> = {};
  for (const r of reg ?? []) {
    if (!(r.drug_id in latestBalance)) latestBalance[r.drug_id] = Number(r.balance_after);
  }

  const list = (drugs ?? []).map((d) => ({
    ...d,
    on_hand: onHand[d.id] ?? 0,
    register_balance: latestBalance[d.id] ?? null,
    low: (d.reorder_level ?? 0) > 0 && (onHand[d.id] ?? 0) <= d.reorder_level,
  }));

  return ok(list);
});

export const runtime = "nodejs";