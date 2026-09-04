import {
  withAuth,
  ok,
  ValidationError,
  ForbiddenError,
  requireTenant,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const MAX_ACCOUNTS = 5;

// GET /api/settings/bank-accounts — staff: all; patient: active only
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  let query = ctx.svc
    .from("hospital_bank_accounts")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (ctx.role === "patient_api") query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw new ValidationError(error.message);
  return ok(data ?? []);
});

interface BankAccountBody {
  bankName: string;
  accountName: string;
  accountNumber: string;
  isActive?: boolean;
}

function validateBody(body: any): BankAccountBody {
  if (!body?.bankName?.trim()) throw new ValidationError("Bank name is required");
  if (!body?.accountName?.trim()) throw new ValidationError("Account name is required");
  if (!body?.accountNumber?.trim()) throw new ValidationError("Account number is required");
  if (!/^\d{10}$/.test(body.accountNumber.trim())) throw new ValidationError("Account number must be 10 digits");
  return {
    bankName: body.bankName.trim(),
    accountName: body.accountName.trim(),
    accountNumber: body.accountNumber.trim(),
    isActive: body.isActive ?? true,
  };
}

// POST /api/settings/bank-accounts — admin adds an account (max 5)
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (ctx.role !== "hospital_admin") {
    throw new ForbiddenError("Only hospital admins can manage bank accounts");
  }
  const body = validateBody(await req.json());

  const { count, error: countErr } = await ctx.svc
    .from("hospital_bank_accounts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (countErr) throw new ValidationError(countErr.message);
  if ((count ?? 0) >= MAX_ACCOUNTS) throw new ValidationError(`Maximum of ${MAX_ACCOUNTS} bank accounts allowed`);

  const { data, error } = await ctx.svc
    .from("hospital_bank_accounts")
    .insert({
      tenant_id: tenantId,
      bank_name: body.bankName,
      account_name: body.accountName,
      account_number: body.accountNumber,
      is_active: body.isActive,
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "hospital_bank_accounts",
    entityId: data.id,
    description: `Added bank account ${body.bankName} / ${body.accountName}`,
  });

  return ok(data, 201);
});

export const runtime = "nodejs";