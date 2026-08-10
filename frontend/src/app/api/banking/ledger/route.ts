import { withStaff, okPaginated, ValidationError, requireTenant, resolveParam } from "@/lib/api-utils";
import { getPagination } from "@/lib/api-utils";
import { classifyLedgerSources } from "@/lib/banking-sources";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

interface AccountRow {
  id: string;
  bank_name: string;
}

interface LedgerRow {
  id: string;
  account_id: string | null;
  direction: "in" | "out";
  amount: number;
  method: string | null;
  source: string;
  source_ref: string | null;
  payment_id: string | null;
  reference: string | null;
  notes: string | null;
  recorded_at: string;
}

// GET /api/banking/ledger?account=cash|<uuid>&direction=&source=&from=&to=&page=&pageSize=
//
// Merged, paginated transaction feed across the main banking ledger AND the
// pharmacy bank ledger (0061), newest first. `account=cash` filters the
// hospital's Cash account (account_id IS NULL); an account_id filters that
// bank; omitted = all accounts. Payment rows are attributed to Lab income /
// Ward income in JS (mirroring lab_income_report + ward admission billing),
// and the `source` filter applies to the attributed value. Pharmacy rows are
// tagged source=pharmacy.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const account = resolveParam(req.nextUrl.searchParams.get("account"));
  const direction = resolveParam(req.nextUrl.searchParams.get("direction"));
  const source = resolveParam(req.nextUrl.searchParams.get("source"));
  const dateFrom = resolveParam(req.nextUrl.searchParams.get("from"));
  const dateTo = resolveParam(req.nextUrl.searchParams.get("to"));

  const accountIds = account && account !== "cash" ? [account] : null;
  const build = (table: "hospital_bank_ledger" | "pharmacy_bank_ledger") => {
    // pharmacy_bank_ledger (0061) predates recorded_at and stamps its rows
    // with created_at; normalize to recorded_at after the fetch.
    const tsCol = table === "pharmacy_bank_ledger" ? "created_at" : "recorded_at";
    const select =
      table === "pharmacy_bank_ledger"
        ? "id, account_id, direction, amount, source, source_ref, payment_id, method, reference, notes, created_at"
        : "id, account_id, direction, amount, source, source_ref, payment_id, method, reference, notes, recorded_at";
    let query = ctx.svc
      .from(table)
      .select(select)
      .eq("tenant_id", tenantId);
    if (account === "cash") query = query.is("account_id", null);
    else if (accountIds) query = query.in("account_id", accountIds);
    if (direction) query = query.eq("direction", direction);
    if (dateFrom) query = query.gte(tsCol, dateFrom);
    if (dateTo) query = query.lte(tsCol, dateTo);
    return query;
  };

  const [mainRes, pharmRes] = await Promise.all([build("hospital_bank_ledger"), build("pharmacy_bank_ledger")]);
  if (mainRes.error) throw new ValidationError(mainRes.error.message);
  if (pharmRes.error) throw new ValidationError(pharmRes.error.message);

  const { data: banksRes } = await ctx.svc
    .from("hospital_bank_accounts")
    .select("id, bank_name")
    .eq("tenant_id", tenantId);
  const bankById = new Map((banksRes ?? []).map((b: AccountRow) => [b.id, b.bank_name]));
  const labelFor = (accountId: string | null) => {
    if (!accountId) return "Cash";
    return bankById.get(accountId) ?? "Bank";
  };

  const sourceById = await classifyLedgerSources(ctx.svc, tenantId, (mainRes.data ?? []) as Array<{ payment_id: string | null }>);

  const mainRows = (mainRes.data ?? []) as Array<Record<string, unknown>>;
  const pharmRows = (pharmRes.data ?? []) as Array<Record<string, unknown>>;
  const rows: Array<Record<string, unknown>> = [
    ...mainRows.map((r) => ({
      ...r,
      source: sourceById.get((r.payment_id as string) ?? "") ?? r.source,
      account_label: labelFor(r.account_id as string | null),
      amount: Number(r.amount),
    })),
    ...pharmRows.map((r) => ({
      ...r,
      source: "pharmacy",
      recorded_at: r.created_at,
      account_label: labelFor(r.account_id as string | null),
      amount: Number(r.amount),
    })),
  ];
  rows.sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)));

  const filtered = source && source !== "all" ? rows.filter((r) => r.source === source) : rows;
  const total = filtered.length;
  const slice = filtered.slice((page - 1) * pageSize, page * pageSize);

  return okPaginated(slice, total, page, pageSize);
});

export const runtime = "nodejs";
