import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/bank-ledger?limit= — recent bank-ledger entries for the
// tenant (all pharmacy payments that hit a bank account), newest first.
// Read-only surface for the Payments tab; writes go through the payments API.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 30, 1), 100);

  const { data, error } = await ctx.svc
    .from("pharmacy_bank_ledger")
    .select(
      "id, direction, amount, source, source_ref, method, reference, notes, created_at, hospital_bank_accounts(bank_name, account_name, account_number), pharmacy_invoices(invoice_number)"
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new ValidationError(error.message);
  return ok(data ?? []);
});

export const runtime = "nodejs";