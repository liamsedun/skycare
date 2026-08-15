import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { classifyLedgerSources } from "@/lib/banking-sources";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

interface StmtRow {
  id: string;
  direction: "in" | "out";
  amount: number;
  source: string;
  source_ref: string | null;
  payment_id: string | null;
  reference: string | null;
  notes: string | null;
  recorded_at: string;
}

// GET /api/banking/statement?account=cash|<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Per-account statement: opening balance (ledger sum BEFORE `from`), period
// rows newest-first with a running balance, period in/out (the opening row
// itself is a carried-forward amount and is excluded from in/out totals),
// and the resulting closing balance. Omit from/to for the full account
// history (opening = 0).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const account = req.nextUrl.searchParams.get("account");
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (!account) throw new ValidationError("account is required ('cash' or a bank account id)");
  const fromIso = from ? new Date(`${from}T00:00:00.000Z`).toISOString() : null;
  const toIso = to ? new Date(`${to}T23:59:59.999Z`).toISOString() : null;

  const [banksRes, rowsRes] = await Promise.all([
    ctx.svc
      .from("hospital_bank_accounts")
      .select("id, bank_name, account_name, account_number")
      .eq("tenant_id", tenantId),
    ctx.svc
      .from("hospital_bank_ledger")
      .select("id, account_id, direction, amount, source, source_ref, payment_id, reference, notes, recorded_at")
      .eq("tenant_id", tenantId)
      .order("recorded_at", { ascending: true })
      .limit(5000),
  ]);
  if (rowsRes.error) throw new ValidationError(rowsRes.error.message);
  if (banksRes.error) throw new ValidationError(banksRes.error.message);

  const bankById = new Map((banksRes.data ?? []).map((b: { id: string; bank_name: string }) => [b.id, b.bank_name]));
  const accountId = account === "cash" ? null : account;
  const label = account === "cash" ? "Cash" : bankById.get(account) ?? "Bank";
  if (account !== "cash" && !bankById.has(account)) throw new ValidationError("Bank account not found");

  const all = (rowsRes.data ?? []) as Array<Record<string, unknown>>;
  const owned = all.filter((r) => (r.account_id ?? null) === accountId);
  const typed = owned as unknown as StmtRow[];

  let opening = 0;
  for (const r of typed) {
    if (fromIso && r.recorded_at < fromIso) opening += r.direction === "in" ? Number(r.amount) : -Number(r.amount);
  }

  const inPeriod = typed.filter(
    (r) => (!fromIso || r.recorded_at >= fromIso) && (!toIso || r.recorded_at <= toIso)
  );
  let inTotal = 0;
  let outTotal = 0;
  let running = opening;
  const rows: Array<Record<string, unknown>> = [];
  for (const r of inPeriod) {
    const signed = r.direction === "in" ? Number(r.amount) : -Number(r.amount);
    running += signed;
    if (r.source !== "opening") {
      if (r.direction === "in") inTotal += Number(r.amount);
      else outTotal += Number(r.amount);
    }
    rows.push({
      id: r.id,
      direction: r.direction,
      amount: Number(r.amount),
      source: r.source,
      source_ref: r.source_ref,
      reference: r.reference,
      notes: r.notes,
      recorded_at: r.recorded_at,
      running_balance: Math.round(running * 100) / 100,
    });
  }

  const sourceById = await classifyLedgerSources(ctx.svc, tenantId, inPeriod as Array<{ payment_id: string | null }>);
  for (const r of rows) {
    if (r.payment_id && sourceById.has(r.payment_id as string)) r.source = sourceById.get(r.payment_id as string);
  }
  rows.reverse(); // newest first for display

  return ok({
    account_id: accountId,
    account_label: label,
    from: from || null,
    to: to || null,
    opening: Math.round(opening * 100) / 100,
    in: Math.round(inTotal * 100) / 100,
    out: Math.round(outTotal * 100) / 100,
    closing: Math.round(running * 100) / 100,
    rows,
  });
});

export const runtime = "nodejs";