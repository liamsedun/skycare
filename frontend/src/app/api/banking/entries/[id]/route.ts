import { withAuth, ok, ValidationError, NotFoundError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { tenantCurrency } from "@/lib/server-currency";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const MANUAL_ROLES = ["hospital_admin", "cashier", "accountant"] as const;

// DELETE /api/banking/entries/[id] — remove a MANUAL ledger entry only:
// adjustments, opening balances, and transfers (transfers delete BOTH sides
// of the pair via transfer_id). Auto-posted rows (payments/income/expenses/
// payroll) are immutable here: delete the source record instead, which
// resyncs the ledger.
export const DELETE = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!(MANUAL_ROLES as readonly string[]).includes(ctx.role)) {
    throw new ForbiddenError("Banking adjustments require admin, cashier or accountant access");
  }
  const id = req.nextUrl.pathname.split("/").pop()!;

  const { data: entry } = await ctx.svc
    .from("hospital_bank_ledger")
    .select("id, source, direction, amount, account_id, notes, transfer_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!entry) throw new NotFoundError("Ledger entry not found");
  if (!["adjustment", "transfer", "opening"].includes(entry.source)) {
    throw new ValidationError("Only manual adjustments, transfers and opening balances can be deleted");
  }

  const ids = new Set<string>([id]);
  if (entry.source === "transfer" && entry.transfer_id) {
    const { data: pair } = await ctx.svc
      .from("hospital_bank_ledger")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("transfer_id", entry.transfer_id);
    for (const p of pair ?? []) ids.add(p.id);
  }
  const idList = [...ids];

  const { error } = await ctx.svc
    .from("hospital_bank_ledger")
    .delete()
    .in("id", idList)
    .eq("tenant_id", tenantId);
  if (error) throw new ValidationError(error.message);

  const { symbol } = await tenantCurrency(ctx.svc, tenantId);
  await logAudit(req, ctx, {
    action: "delete",
    entityType: "hospital_bank_ledger",
    entityId: id,
    description:
      entry.source === "transfer"
        ? `Deleted transfer of ${symbol}${Number(entry.amount).toLocaleString()}`
        : entry.source === "opening"
          ? `Deleted opening balance of ${symbol}${Number(entry.amount).toLocaleString()}`
          : `Deleted manual ${entry.direction === "in" ? "receipt" : "payment"} of ${symbol}${Number(entry.amount).toLocaleString()}`,
  });

  return ok({ ok: true, deleted: idList.length });
});

export const runtime = "nodejs";
