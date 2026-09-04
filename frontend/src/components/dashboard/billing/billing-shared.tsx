import { BedDouble, Microscope, Pill, Stethoscope } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export async function fetchAllPatients() {
  const out: Array<{ id: string; patient_number: string }> = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`/api/patients?page=${page}&pageSize=100`, { cache: "no-store" });
    if (!res.ok) break;
    const body = await res.json();
    const data = (body.data ?? []) as Array<{ id: string; patient_number: string }>;
    out.push(...data);
    if (data.length < 100) break;
  }
  return out;
}

export interface PatientOption {
  id: string;
  label: string;
}

export interface Invoice {
  id: string;
  kind: "central" | "pharmacy";
  source: "medical" | "lab" | "ward" | "pharmacy";
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  status: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  notes: string | null;
  patients: { id: string; patient_number: string; first_name: string; last_name: string } | null;
  invoice_items: Array<{ id: string; description: string; quantity: number; unit_price: number; total_price: number; vat_percent: number; vat_amount: number }>;
  payments: Array<{ id: string; amount: number; payment_method: string; status: string; reference: string | null; paid_at: string }>;
}

export interface PendingPayment {
  id: string;
  amount: number;
  payment_method: string;
  reference: string | null;
  paid_at: string;
  invoice_id: string | null;
  patients: { id: string; patient_number: string; first_name: string; last_name: string } | null;
}

export const STATUS_FILTERS = ["all", "pending", "partially_paid", "paid", "cancelled", "draft"];
export const SOURCE_FILTERS = ["all", "medical", "lab", "pharmacy", "ward"];

export const SOURCE_META: Record<string, { label: string; cls: string; icon: LucideIcon }> = {
  medical: { label: "Medical", cls: "bg-sky-100 text-sky-700", icon: Stethoscope },
  lab: { label: "Lab", cls: "bg-indigo-100 text-indigo-700", icon: Microscope },
  ward: { label: "Ward", cls: "bg-fuchsia-100 text-fuchsia-700", icon: BedDouble },
  pharmacy: { label: "Pharmacy", cls: "bg-emerald-100 text-emerald-700", icon: Pill },
};

export const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
export const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

import { getTenantCurrency } from "@/lib/currency";

export function ngn(amount: number, currency?: string): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currency || getTenantCurrency() || "NGN",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function statusClass(status: string): string {
  switch (status) {
    case "paid": return "bg-emerald-100 text-emerald-700";
    case "pending": return "bg-amber-100 text-amber-700";
    case "partially_paid": return "bg-sky-100 text-sky-700";
    case "draft": return "bg-slate-100 text-slate-600";
    default: return "bg-red-100 text-red-700";
  }
}

export function printHref(inv: Invoice): string {
  return `/app/billing/invoice/${inv.id}/print${inv.kind === "pharmacy" ? "?kind=pharmacy" : ""}`;
}