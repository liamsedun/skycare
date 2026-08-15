import { withAuth, ok, ValidationError, ForbiddenError, requireTenant, resolveBankAccountId } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const MANUAL_ROLES = ["hospital_admin", "super_admin", "cashier", "accountant"] as const;

// POST /api/banking/entries — record a manual receipt ('in') or payment
// ('out') directly into Cash or a bank account. account: "cash" or a
// hospital_bank_accounts id (must exist and be active for the tenant).
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!(MANUAL_ROLES as readonly string[]).includes(ctx.role)) {
    throw new ForbiddenError("Banking adjustments require admin, cashier or accountant access");
  }
  const body = (await req.json()) as {
    direction?: string;
    account?: string;
    amount?: number;
    method?: string;
    reference?: string;
    notes?: string;
    recordedAt?: string;
    source?: string;
  };

  if (body.direction !== "in" && body.direction !== "out") {
    throw new ValidationError("direction must be 'in' (receipt) or 'out' (payment)");
  }
  if (!Number.isFinite(Number(body.amount)) || Number(body.amount) <= 0) {
    throw new ValidationError("A positive amount is required");
  }
  const source = body.source === "opening" ? "opening" : "adjustment";
  if (source === "opening" && body.direction !== "in") {
    throw new ValidationError("An opening balance must be a receipt ('in')");
  }

  let accountId: string | null = null;
  if (body.account && body.account !== "cash") {
    const { data: bank } = await ctx.svc
      .from("hospital_bank_accounts")
      .select("id, bank_name")
      .eq("id", body.account)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();
    if (!bank) throw new ValidationError("Bank account not found or inactive");
    accountId = bank.id;
  }

  if (source === "opening") {
    const { count } = await ctx.svc
      .from("hospital_bank_ledger")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("source", "opening")
      .is("account_id", accountId);
    if ((count ?? 0) > 0) {
      throw new ValidationError("An opening balance is already set for this account — delete it first to change it");
    }
  }

  const { data: entry, error } = await ctx.svc
    .from("hospital_bank_ledger")
    .insert({
      tenant_id: tenantId,
      branch_id: ctx.branchId ?? null,
      account_id: accountId,
      direction: body.direction,
      amount: Number(body.amount),
      source,
      source_ref: source === "opening" ? "Opening balance" : body.direction === "in" ? "Manual receipt" : "Manual payment",
      method: source === "opening" ? null : (body.method?.trim() || null),
      reference: body.reference?.trim() || null,
      notes: body.notes?.trim() || null,
      recorded_at: body.recordedAt ? new Date(body.recordedAt).toISOString() : new Date().toISOString(),
      created_by: ctx.user.id,
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "hospital_bank_ledger",
    entityId: entry.id,
    description:
      source === "opening"
        ? `Opening balance of ₦${Number(body.amount).toLocaleString()} for ${accountId ? "bank" : "Cash"}`
        : `Manual ${body.direction === "in" ? "receipt" : "payment"} of ₦${Number(body.amount).toLocaleString()} → ${
            accountId ? "bank" : "Cash"
          }${body.notes ? ` — ${body.notes}` : ""}`,
  });

  return ok(entry, 201);
});

export const runtime = "nodejs";
