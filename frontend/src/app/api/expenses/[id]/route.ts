import { withStaff, ok, ValidationError, NotFoundError, requireTenant, resolveBankAccountId, bankLedgerAccountForMethod, postBankLedger, requireModuleLevel } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function getExpense(ctx: any, id: string, tenantId: string) {
  const { data } = await ctx.svc
    .from("expenses")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

// GET /api/expenses/[id]
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const expense = await getExpense(ctx, id, tenantId);
  if (!expense) throw new NotFoundError("Expense not found");
  return ok(expense);
});

// PUT /api/expenses/[id]
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  await requireModuleLevel(ctx, "expenses", "full");
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getExpense(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Expense not found");

  const body = (await req.json()) as Record<string, unknown>;
  if (body.category && !EXPENSE_CATEGORIES.includes(body.category as (typeof EXPENSE_CATEGORIES)[number])) {
    throw new ValidationError("Invalid expense category");
  }

  const allowed = ["description", "category", "amount", "expense_date", "payment_method", "vendor", "notes"];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key] ?? null;
  }

  const { data: updated, error } = await ctx.svc
    .from("expenses")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  // Resync the banking ledger: drop the old posting and re-post from the
  // updated values so amounts/methods/dates never drift from the expense.
  try {
    await ctx.svc.from("hospital_bank_ledger").delete().eq("expense_id", id).eq("tenant_id", tenantId);
    const defaultBankId = await resolveBankAccountId(ctx.svc, tenantId);
    await postBankLedger(ctx.svc, {
      tenantId,
      branchId: updated.branch_id ?? null,
      accountId: bankLedgerAccountForMethod(updated.payment_method, defaultBankId),
      direction: "out",
      amount: Number(updated.amount),
      source: "expense",
      sourceRef: updated.description,
      expenseId: updated.id,
      method: updated.payment_method,
      reference: updated.vendor ?? null,
      notes: `${updated.category} expense`,
      recordedAt: new Date(`${updated.expense_date}T12:00:00`).toISOString(),
      createdBy: ctx.user.id,
    });
  } catch (e) {
    console.error("banking-ledger resync failed", e);
  }

  await logAudit(req, ctx, {
    action: "update",
    entityType: "expenses",
    entityId: id,
    description: `Updated expense "${existing.description}"`,
  });

  return ok(updated);
});

// DELETE /api/expenses/[id]
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  await requireModuleLevel(ctx, "expenses", "full");
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getExpense(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Expense not found");

  // Remove the banking ledger posting with the source record.
  try {
    await ctx.svc.from("hospital_bank_ledger").delete().eq("expense_id", id).eq("tenant_id", tenantId);
  } catch (e) {
    console.error("banking-ledger cleanup failed", e);
  }

  await ctx.svc.from("expenses").delete().eq("id", id).eq("tenant_id", tenantId);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "expenses",
    entityId: id,
    description: `Deleted expense "${existing.description}"`,
  });
  return ok({ ok: true });
});

export const runtime = "nodejs";
