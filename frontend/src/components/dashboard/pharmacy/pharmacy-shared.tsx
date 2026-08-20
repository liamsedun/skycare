"use client";

// Shared cells for the Pharmacy Billing module: form class strings, the naira
// formatter, status badges, the paged fetcher, stat cards and shared types.

export const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
export const btnPrimary =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60";
export const btnGhost =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-slate-50 disabled:opacity-60";
export const ngn = (v: number | null | undefined) => `â‚¦${Number(v ?? 0).toLocaleString()}`;

export async function fetchAll<T>(url: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 10; page++) {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}page=${page}&pageSize=100`, { cache: "no-store" });
    if (!res.ok) break;
    const body = await res.json();
    const data = (body.data ?? []) as T[];
    out.push(...data);
    if (data.length < 100) break;
  }
  return out;
}

function statusBadge(status: string): string {  switch (status) {
    case "paid": return "bg-emerald-100 text-emerald-700";
    case "partial": return "bg-amber-100 text-amber-700";
    case "unpaid": return "bg-red-100 text-red-700";
    case "cancelled": return "bg-slate-100 text-slate-600";
    case "refunded": return "bg-indigo-100 text-indigo-700";
    case "draft": return "bg-sky-100 text-sky-700";
    case "pending": return "bg-amber-100 text-amber-700";
    case "approved": return "bg-emerald-100 text-emerald-700";
    case "rejected": return "bg-red-100 text-red-700";
    default: return "bg-slate-100 text-slate-600";
  }
}

export function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadge(value)}`}>
      {value}
    </span>
  );
}

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  source: string;
  status: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  insurance_claimable: boolean;
  created_at: string;
  patients: { patient_number: string; first_name: string; last_name: string } | null;
  pharmacy_invoice_items?: Array<{ id: string; drug_name: string; quantity: number; unit_price: number; total_price: number }>;
}

export interface DrugOption { id: string; name: string; unitPrice: number; dosage: string | null; inStock: number; priceSource?: "branch_override" | "base_override" | "catalog" | "wholesale" }
export interface PatientOption { id: string; label: string }

export function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-sm)]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-600" : "text-[var(--color-foreground)]"}`}>{value}</p>
    </div>
  );
}
