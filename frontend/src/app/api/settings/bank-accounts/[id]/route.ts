import {
  withAuth,
  ok,
  ValidationError,
  ForbiddenError,
  NotFoundError,
  requireTenant,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function idFrom(req: NextRequest): string {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  return segs[segs.length - 1];
}

function adminOnly(role: string): void {
  if (role !== "hospital_admin" && role !== "super_admin") {
    throw new ForbiddenError("Only hospital admins can manage bank accounts");
  }
}

// PUT /api/settings/bank-accounts/[id]
export const PUT = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  adminOnly(ctx.role);
  const id = idFrom(req);
  const body = await req.json();

  const { data: existing, error: getErr } = await ctx.svc
    .from("hospital_bank_accounts")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (getErr || !existing) throw new NotFoundError("Bank account not found");

  const patch: Record<string, any> = {};
  if (body.bankName !== undefined) {
    if (!body.bankName?.trim()) throw new ValidationError("Bank name is required");
    patch.bank_name = body.bankName.trim();
  }
  if (body.accountName !== undefined) {
    if (!body.accountName?.trim()) throw new ValidationError("Account name is required");
    patch.account_name = body.accountName.trim();
  }
  if (body.accountNumber !== undefined) {
    if (!/^\d{10}$/.test(body.accountNumber?.trim() ?? "")) throw new ValidationError("Account number must be 10 digits");
    patch.account_number = body.accountNumber.trim();
  }
  if (body.isActive !== undefined) patch.is_active = !!body.isActive;

  const { data, error } = await ctx.svc.from("hospital_bank_accounts").update(patch).eq("id", id).select().single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "hospital_bank_accounts",
    entityId: id,
    description: "Updated bank account",
  });

  return ok(data);
});

// DELETE /api/settings/bank-accounts/[id]
export const DELETE = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  adminOnly(ctx.role);
  const id = idFrom(req);

  const { data: existing, error: getErr } = await ctx.svc
    .from("hospital_bank_accounts")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (getErr || !existing) throw new NotFoundError("Bank account not found");

  const { error } = await ctx.svc.from("hospital_bank_accounts").delete().eq("id", id);
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "hospital_bank_accounts",
    entityId: id,
    description: "Deleted bank account",
  });

  return ok({ ok: true });
});

export const runtime = "nodejs";