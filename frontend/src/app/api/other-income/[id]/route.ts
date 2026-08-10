import { withStaff, ok, ValidationError, NotFoundError, requireTenant, resolveBankAccountId, bankLedgerAccountForMethod, postBankLedger } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { INCOME_CATEGORIES } from "@/lib/expense-categories";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function getIncome(ctx: any, id: string, tenantId: string) {
  const { data } = await ctx.svc
    .from("other_income")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

// GET /api/other-income/[id]
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const income = await getIncome(ctx, id, tenantId);
  if (!income) throw new NotFoundError("Income record not found");
  return ok(income);
});

// PUT /api/other-income/[id]
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getIncome(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Income record not found");

  const body = (await req.json()) as Record<string, unknown>;
  if (body.category && !INCOME_CATEGORIES.includes(body.category as (typeof INCOME_CATEGORIES)[number])) {
    throw new ValidationError("Invalid income category");
  }

  const allowed = ["description", "category", "amount", "income_date", "payment_method", "source", "notes"];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key] ?? null;
  }

  const { data: updated, error } = await ctx.svc
    .from("other_income")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  // Resync the banking ledger: drop the old posting and re-post from the
  // updated values so amounts/methods/dates never drift from the income row.
  try {
    await ctx.svc.from("hospital_bank_ledger").delete().eq("income_id", id).eq("tenant_id", tenantId);
    const defaultBankId = await resolveBankAccountId(ctx.svc, tenantId);
    await postBankLedger(ctx.svc, {
      tenantId,
      branchId: updated.branch_id ?? null,
      accountId: bankLedgerAccountForMethod(updated.payment_method, defaultBankId),
      direction: "in",
      amount: Number(updated.amount),
      source: "other_income",
      sourceRef: updated.description,
      incomeId: updated.id,
      method: updated.payment_method,
      reference: updated.source ?? null,
      notes: `${updated.category} income`,
      recordedAt: new Date(`${updated.income_date}T12:00:00`).toISOString(),
      createdBy: ctx.user.id,
    });
  } catch (e) {
    console.error("banking-ledger resync failed", e);
  }

  await logAudit(req, ctx, {
    action: "update",
    entityType: "other_income",
    entityId: id,
    description: `Updated income record "${existing.description}"`,
  });

  return ok(updated);
});

// DELETE /api/other-income/[id]
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getIncome(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Income record not found");

  // Remove the banking ledger posting with the source record.
  try {
    await ctx.svc.from("hospital_bank_ledger").delete().eq("income_id", id).eq("tenant_id", tenantId);
  } catch (e) {
    console.error("banking-ledger cleanup failed", e);
  }

  await ctx.svc.from("other_income").delete().eq("id", id).eq("tenant_id", tenantId);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "other_income",
    entityId: id,
    description: `Deleted income record "${existing.description}"`,
  });
  return ok({ ok: true });
});

export const runtime = "nodejs";
