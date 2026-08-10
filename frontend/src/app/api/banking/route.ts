import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { classifyLedgerSources } from "@/lib/banking-sources";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

interface BankRow {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  is_active: boolean;
}

interface LedgerRow {
  id: string;
  account_id: string | null;
  direction: "in" | "out";
  amount: number;
  method: string | null;
  reference: string | null;
  notes: string | null;
  recorded_at: string;
  [k: string]: unknown;
}

// GET /api/banking — overview: accounts (Cash + every bank from Settings,
// auto-linked), per-account balances + this-month in/out, and the 25 most
// recent transactions across the main ledger and pharmacy sales.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [banksRes, mainRes, pharmRes] = await Promise.all([
    ctx.svc
      .from("hospital_bank_accounts")
      .select("id, bank_name, account_name, account_number, is_active")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true }),
    ctx.svc
      .from("hospital_bank_ledger")
      .select("id, account_id, direction, amount, method, source, source_ref, payment_id, reference, notes, recorded_at")
      .eq("tenant_id", tenantId),
    ctx.svc
      .from("pharmacy_bank_ledger")
      .select("id, account_id, direction, amount, method, source, source_ref, reference, notes, recorded_at")
      .eq("tenant_id", tenantId),
  ]);
  if (banksRes.error) throw new ValidationError(banksRes.error.message);
  if (mainRes.error) throw new ValidationError(mainRes.error.message);
  if (pharmRes.error) throw new ValidationError(pharmRes.error.message);

  const banks: BankRow[] = banksRes.data ?? [];
  const bankById = new Map(banks.map((b) => [b.id, b]));
  const labelFor = (accountId: string | null) => {
    if (!accountId) return "Cash";
    return bankById.get(accountId)?.bank_name ?? "Bank";
  };

  interface Acc {
    id: string | null;
    label: string;
    is_active: boolean;
    balance: number;
    monthIn: number;
    monthOut: number;
  }
  const accs = new Map<string | null, Acc>();
  accs.set(null, { id: null, label: "Cash", is_active: true, balance: 0, monthIn: 0, monthOut: 0 });
  for (const b of banks) {
    accs.set(b.id, { id: b.id, label: labelFor(b.id), is_active: b.is_active, balance: 0, monthIn: 0, monthOut: 0 });
  }

  const apply = (rows: LedgerRow[], balanceOnly: boolean) => {
    for (const r of rows) {
      const acc = accs.get(r.account_id ?? null);
      if (!acc) continue;
      const signed = r.direction === "in" ? Number(r.amount) : -Number(r.amount);
      acc.balance += signed;
      if (!balanceOnly) {
        const inMonth = new Date(r.recorded_at) >= monthStart;
        if (!inMonth) continue;
        if (r.direction === "in") acc.monthIn += Number(r.amount);
        else acc.monthOut += Number(r.amount);
      }
    }
  };
  apply(mainRes.data ?? [], false);
  // Pharmacy ledger rows are balance-only: cash/pharmacy takings live on the
  // pharmacy side; month totals are already tracked in the main ledger.
  apply(pharmRes.data ?? [], true);

  const recent: Array<Record<string, unknown>> = [];
  const mainRows = (mainRes.data ?? []) as Array<Record<string, unknown>>;
  const pharmRows = (pharmRes.data ?? []) as Array<Record<string, unknown>>;
  for (const r of [...mainRows, ...pharmRows]) {
    recent.push({
      id: r.id,
      account_id: r.account_id ?? null,
      account_label: labelFor(r.account_id as string | null),
      direction: r.direction,
      amount: Number(r.amount),
      method: r.method,
      source: r.source === "pharmacy_payment" ? "pharmacy" : r.source,
      payment_id: r.payment_id ?? null,
      source_ref: r.source_ref,
      reference: r.reference,
      notes: r.notes,
      recorded_at: r.recorded_at,
    });
  }
  recent.sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)));

  // Attribute payment rows to Lab / Ward income for display.
  const sourceById = await classifyLedgerSources(ctx.svc, tenantId, (mainRes.data ?? []) as Array<{ payment_id: string | null }>);
  for (const r of recent) {
    if (r.payment_id && sourceById.has(r.payment_id as string)) r.source = sourceById.get(r.payment_id as string);
  }

  const { data: totals } = await ctx.svc
    .from("hospital_bank_ledger")
    .select("direction, amount")
    .eq("tenant_id", tenantId)
    .gte("recorded_at", monthStart.toISOString());
  let monthIn = 0;
  let monthOut = 0;
  for (const t of (totals ?? []) as LedgerRow[]) {
    if (t.direction === "in") monthIn += Number(t.amount);
    else monthOut += Number(t.amount);
  }

  return ok({
    accounts: [...accs.values()].map((a) => ({
      id: a.id ?? "cash",
      account_id: a.id,
      label: a.label,
      bank_name: a.id ? bankById.get(a.id)?.bank_name ?? null : null,
      account_name: a.id ? bankById.get(a.id)?.account_name ?? null : null,
      account_number: a.id ? bankById.get(a.id)?.account_number ?? null : null,
      is_active: a.is_active,
      balance: Math.round(a.balance * 100) / 100,
      month_in: Math.round(a.monthIn * 100) / 100,
      month_out: Math.round(a.monthOut * 100) / 100,
    })),
    month_totals: { in: monthIn, out: monthOut },
    recent: recent.slice(0, 25),
  });
});

export const runtime = "nodejs";
