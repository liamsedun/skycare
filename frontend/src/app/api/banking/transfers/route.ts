import { withAuth, ok, ValidationError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { tenantCurrency } from "@/lib/server-currency";
import crypto from "node:crypto";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const MANUAL_ROLES = ["hospital_admin", "cashier", "accountant"] as const;

interface TransferBody {
  fromAccount?: string;
  toAccount?: string;
  amount?: number;
  method?: string;
  notes?: string;
  recordedAt?: string;
}

interface BankRow {
  id: string;
  bank_name: string;
  account_name: string | null;
  is_active: boolean;
}

// POST /api/banking/transfers — move money between the hospital's own
// accounts (Cash <-> Bank or Bank <-> Bank). Writes a paired ledger entry:
// an 'out' row on the source account and an 'in' row on the destination,
// sharing transfer_id + reference (TRF-xxxx). account: "cash" | bank uuid.
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { symbol } = await tenantCurrency(ctx.svc, tenantId);
  if (!(MANUAL_ROLES as readonly string[]).includes(ctx.role)) {
    throw new ForbiddenError("Banking adjustments require admin, cashier or accountant access");
  }
  const body = (await req.json()) as TransferBody;

  if (typeof body.fromAccount !== "string" || typeof body.toAccount !== "string") {
    throw new ValidationError("fromAccount and toAccount are required ('cash' or a bank account id)");
  }
  if (body.fromAccount === body.toAccount) {
    throw new ValidationError("Source and destination must be different accounts");
  }
  if (!Number.isFinite(Number(body.amount)) || Number(body.amount) <= 0) {
    throw new ValidationError("A positive amount is required");
  }

  const want = (id: string): "cash" | "bank" => (id === "cash" ? "cash" : "bank");
  const { data: banksData, error: banksError } = await ctx.svc
    .from("hospital_bank_accounts")
    .select("id, bank_name, account_name, is_active")
    .in("id", [body.fromAccount, body.toAccount].filter((a) => a !== "cash"))
    .eq("tenant_id", tenantId);
  if (banksError) throw new ValidationError(banksError.message);
  const bankById = new Map<string, BankRow>((banksData ?? []).map((b: BankRow) => [b.id, b]));

  const labelOf = (id: string): string => {
    if (id === "cash") return "Cash";
    const bk = bankById.get(id);
    if (!bk) throw new ValidationError("Bank account not found or inactive");
    if (!bk.is_active) throw new ValidationError("Bank account is inactive");
    return bk.bank_name;
  };
  const fromLabel = labelOf(body.fromAccount);
  const toLabel = labelOf(body.toAccount);

  const transferId = crypto.randomUUID();
  const reference = `TRF-${transferId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const recordedAt = body.recordedAt ? new Date(body.recordedAt).toISOString() : new Date().toISOString();
  const notes = body.notes?.trim() || null;
  const method = body.method?.trim() || null;
  const amount = Number(body.amount);

  const rows = [
    {
      tenant_id: tenantId,
      branch_id: ctx.branchId ?? null,
      account_id: body.fromAccount === "cash" ? null : body.fromAccount,
      direction: "out",
      amount,
      source: "transfer",
      source_ref: `Transfer to ${toLabel}`,
      transfer_id: transferId,
      method,
      reference,
      notes,
      recorded_at: recordedAt,
      created_by: ctx.user.id,
    },
    {
      tenant_id: tenantId,
      branch_id: ctx.branchId ?? null,
      account_id: body.toAccount === "cash" ? null : body.toAccount,
      direction: "in",
      amount,
      source: "transfer",
      source_ref: `Transfer from ${fromLabel}`,
      transfer_id: transferId,
      method,
      reference,
      notes,
      recorded_at: recordedAt,
      created_by: ctx.user.id,
    },
  ];

  const { data, error } = await ctx.svc.from("hospital_bank_ledger").insert(rows).select();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "hospital_bank_ledger",
    entityId: transferId,
    description: `Transfer of ${symbol}${amount.toLocaleString()} from ${fromLabel} to ${toLabel}`,
  });

  const pair = (data ?? []).find((r: { direction: string }) => r.direction === "in");
  const from = (data ?? []).find((r: { direction: string }) => r.direction === "out");
  return ok({ transfer_id: transferId, reference, from: from?.id ?? null, to: pair?.id ?? null, from_label: fromLabel, to_label: toLabel }, 201);
});

export const runtime = "nodejs";