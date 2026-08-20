export const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
export const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";
export const naira = (n: number) => `₦${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export interface AccountCard {
  id: string; // "cash" | bank uuid
  account_id: string | null;
  label: string;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  is_active: boolean;
  balance: number;
  month_in: number;
  month_out: number;
}

export interface LedgerItem {
  id: string;
  account_id: string | null;
  account_label: string;
  direction: "in" | "out";
  amount: number;
  method: string | null;
  source: string;
  source_ref: string | null;
  reference: string | null;
  notes: string | null;
  recorded_at: string;
}

export interface StmtRow extends LedgerItem {
  running_balance: number;
}

export interface StmtData {
  account_id: string | null;
  account_label: string;
  from: string | null;
  to: string | null;
  opening: number;
  in: number;
  out: number;
  closing: number;
  rows: StmtRow[];
}

export const SOURCE_LABELS: Record<string, string> = {
  payment: "Patient payment",
  lab: "Lab income",
  ward: "Ward income",
  other_income: "Other income",
  expense: "Expense",
  adjustment: "Manual entry",
  transfer: "Transfer",
  opening: "Opening balance",
  payroll: "Payroll",
  pharmacy: "Pharmacy",
};

export const MANUAL_SOURCES = new Set(["adjustment", "transfer", "opening"]);