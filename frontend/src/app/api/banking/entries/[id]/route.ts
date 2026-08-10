import { withAuth, ok, ValidationError, NotFoundError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const MANUAL_ROLES = ["hospital_admin", "super_admin", "cashier", "accountant"] as const;

// DELETE /api/banking/entries/[id] — remove a MANUAL ledger entry only.
// Auto-posted rows (payments/income/expenses) are immutable here: delete the
// source record instead, which resyncs the ledger.
export const DELETE = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!(MANUAL_ROLES as readonly string[]).includes(ctx.role)) {
    throw new ForbiddenError("Banking adjustments require admin, cashier or accountant access");
  }
  const id = req.nextUrl.pathname.split("/").pop()!;

  const { data: entry } = await ctx.svc
    .from("hospital_bank_ledger")
    .select("id, source, direction, amount, account_id, notes")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!entry) throw new NotFoundError("Ledger entry not found");
  if (entry.source !== "adjustment") {
    throw new ValidationError("Only manual adjustments can be deleted");
  }

  const { error } = await ctx.svc
    .from("hospital_bank_ledger")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "hospital_bank_ledger",
    entityId: id,
    description: `Deleted manual ${entry.direction === "in" ? "receipt" : "payment"} of ₦${Number(entry.amount).toLocaleString()}`,
  });

  return ok({ ok: true });
});

export const runtime = "nodejs";
