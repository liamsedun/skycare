import { withStaff, okPaginated, ok, ValidationError, requireTenant, sanitizeLike, resolvePayingAccountId, postBankLedger, requireModuleLevel } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { INCOME_CATEGORIES } from "@/lib/expense-categories";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const SELECT =
  "id, tenant_id, branch_id, account_id, description, category, amount, income_date, payment_method, source, notes, created_by, created_at, updated_at";

// GET /api/other-income?category=&from=&to=&search=&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const category = resolveParam(req.nextUrl.searchParams.get("category"));
  const dateFrom = resolveParam(req.nextUrl.searchParams.get("from"));
  const dateTo = resolveParam(req.nextUrl.searchParams.get("to"));
  const search = resolveParam(req.nextUrl.searchParams.get("search"))?.trim();

  let query = ctx.svc
    .from("other_income")
    .select(SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("income_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (category) query = query.eq("category", category);
  if (dateFrom) query = query.gte("income_date", dateFrom);
  if (dateTo) query = query.lte("income_date", dateTo);
  if (search) query = query.or(`description.ilike.%${sanitizeLike(search)}%,source.ilike.%${sanitizeLike(search)}%`);

  const { data, count } = await query;
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export interface CreateIncomeBody {
  description: string;
  category: string;
  amount: number;
  incomeDate: string;
  paymentMethod?: string;
  accountId?: string | null;
  source?: string;
  notes?: string;
}

// POST /api/other-income
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  await requireModuleLevel(ctx, "other-income", "full");
  const body = (await req.json()) as CreateIncomeBody;

  if (!body.description?.trim() || !body.amount || body.amount <= 0) {
    throw new ValidationError("Description and a positive amount are required");
  }
  if (!INCOME_CATEGORIES.includes(body.category as (typeof INCOME_CATEGORIES)[number])) {
    throw new ValidationError("Invalid income category");
  }

  const ledgerAccount = await resolvePayingAccountId(ctx.svc, tenantId, body.accountId, body.paymentMethod || "cash");

  const { data: income, error } = await ctx.svc
    .from("other_income")
    .insert({
      tenant_id: tenantId,
      branch_id: ctx.branchId ?? null,
      account_id: ledgerAccount,
      description: body.description.trim(),
      category: body.category,
      amount: body.amount,
      income_date: body.incomeDate || new Date().toISOString().slice(0, 10),
      payment_method: body.paymentMethod || "cash",
      source: body.source?.trim() || null,
      notes: body.notes?.trim() || null,
      created_by: ctx.user.id,
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "other_income",
    entityId: income.id,
    description: `Recorded income ₦${body.amount.toLocaleString()} — ${body.description.trim()}`,
  });

  // Banking ledger auto-post: the receipt lands in the selected account — Cash
  // when accountId is "cash"/unset-with-cash-method, the chosen bank when a
  // bank is picked, or the tenant default bank for other methods.
  try {
    await postBankLedger(ctx.svc, {
      tenantId,
      branchId: ctx.branchId ?? null,
      accountId: ledgerAccount,
      direction: "in",
      amount: Number(income.amount),
      source: "other_income",
      sourceRef: income.description,
      incomeId: income.id,
      method: income.payment_method,
      reference: income.source ?? null,
      notes: `${income.category} income`,
      recordedAt: new Date(`${income.income_date}T12:00:00`).toISOString(),
      createdBy: ctx.user.id,
    });
  } catch (e) {
    console.error("banking-ledger post failed", e);
  }

  return ok(income, 201);
});

export const runtime = "nodejs";
