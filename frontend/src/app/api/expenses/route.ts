import { withStaff, okPaginated, ok, ValidationError, requireTenant, sanitizeLike, resolvePayingAccountId, postBankLedger, requireModuleLevel, applyBranchFilter } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { tenantCurrency } from "@/lib/server-currency";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const SELECT =
  "id, tenant_id, branch_id, account_id, description, category, amount, expense_date, payment_method, vendor, notes, created_by, created_at, updated_at";

// GET /api/expenses?category=&from=&to=&search=&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const category = resolveParam(req.nextUrl.searchParams.get("category"));
  const dateFrom = resolveParam(req.nextUrl.searchParams.get("from"));
  const dateTo = resolveParam(req.nextUrl.searchParams.get("to"));
  const search = resolveParam(req.nextUrl.searchParams.get("search"))?.trim();

  let query = ctx.svc
    .from("expenses")
    .select(SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  query = applyBranchFilter(query, req.nextUrl.searchParams, ctx);

  if (category) query = query.eq("category", category);
  if (dateFrom) query = query.gte("expense_date", dateFrom);
  if (dateTo) query = query.lte("expense_date", dateTo);
  if (search) query = query.or(`description.ilike.%${sanitizeLike(search)}%,vendor.ilike.%${sanitizeLike(search)}%`);

  const { data, count } = await query;
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export interface CreateExpenseBody {
  description: string;
  category: string;
  amount: number;
  expenseDate: string;
  paymentMethod?: string;
  accountId?: string | null;
  vendor?: string;
  notes?: string;
}

// POST /api/expenses
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  await requireModuleLevel(ctx, "expenses", "full");
  const { symbol } = await tenantCurrency(ctx.svc, tenantId);
  const body = (await req.json()) as CreateExpenseBody;

  if (!body.description?.trim() || !body.amount || body.amount <= 0) {
    throw new ValidationError("Description and a positive amount are required");
  }
  if (!EXPENSE_CATEGORIES.includes(body.category as (typeof EXPENSE_CATEGORIES)[number])) {
    throw new ValidationError("Invalid expense category");
  }

  const ledgerAccount = await resolvePayingAccountId(ctx.svc, tenantId, body.accountId, body.paymentMethod || "cash");

  const { data: expense, error } = await ctx.svc
    .from("expenses")
    .insert({
      tenant_id: tenantId,
      branch_id: ctx.branchId ?? null,
      account_id: ledgerAccount,
      description: body.description.trim(),
      category: body.category,
      amount: body.amount,
      expense_date: body.expenseDate || new Date().toISOString().slice(0, 10),
      payment_method: body.paymentMethod || "cash",
      vendor: body.vendor?.trim() || null,
      notes: body.notes?.trim() || null,
      created_by: ctx.user.id,
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "expenses",
    entityId: expense.id,
    description: `Recorded expense ${symbol}${body.amount.toLocaleString()} — ${body.description.trim()}`,
  });

  // Banking ledger auto-post: the money leaves the selected account — Cash
  // when accountId is "cash"/unset-with-cash-method, the chosen bank when a
  // bank is picked, or the tenant default bank for other methods.
  try {
    await postBankLedger(ctx.svc, {
      tenantId,
      branchId: ctx.branchId ?? null,
      accountId: ledgerAccount,
      direction: "out",
      amount: Number(expense.amount),
      source: "expense",
      sourceRef: expense.description,
      expenseId: expense.id,
      method: expense.payment_method,
      reference: expense.vendor ?? null,
      notes: `${expense.category} expense`,
      recordedAt: new Date(`${expense.expense_date}T12:00:00`).toISOString(),
      createdBy: ctx.user.id,
    });
  } catch (e) {
    console.error("banking-ledger post failed", e);
  }

  return ok(expense, 201);
});

export const runtime = "nodejs";
