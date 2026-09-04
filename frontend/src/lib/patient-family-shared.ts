import { Baby, Heart, Users } from "lucide-react";
import { getTenantCurrency } from "@/lib/currency";

/** Single patient/family row as returned by /api/patients/me (patients table). */
export interface FamilyMember {
  id: string;
  patient_number: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  date_of_birth: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  blood_group: string | null;
  genotype: string | null;
  allergies: string | null;
  chronic_conditions: string | null;
  dependant_relationship: string | null;
  is_primary_account: boolean;
  primary_account_id: string | null;
  user_id: string | null;
  marital_status: string | null;
  status: string | null;
  avatar_url: string | null;
  created_at: string | null;
}

export const MAX_DEPENDANTS = 5;

/** LB relationship vocabulary (stored lowercase). Staff UI keeps its own set. */
export const RELATIONSHIPS = ["Child", "Spouse", "Parent", "Sibling", "Grandparent", "Other"];

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const GENOTYPES = ["AA", "AS", "SS", "AC", "SC", "CC"];

interface RelInfo {
  label: string;
  icon: typeof Users;
  grad: string;
  badge: string;
}

export const REL_INFO: Record<string, RelInfo> = {
  child: { label: "Child", icon: Baby, grad: "from-sky-500 to-blue-600", badge: "bg-sky-50 text-sky-700" },
  spouse: { label: "Spouse", icon: Heart, grad: "from-rose-500 to-pink-600", badge: "bg-rose-50 text-rose-700" },
  parent: { label: "Parent", icon: Heart, grad: "from-emerald-500 to-teal-600", badge: "bg-emerald-50 text-emerald-700" },
  sibling: { label: "Sibling", icon: Users, grad: "from-violet-500 to-indigo-600", badge: "bg-violet-50 text-violet-700" },
  grandparent: { label: "Grandparent", icon: Users, grad: "from-amber-400 to-orange-500", badge: "bg-amber-50 text-amber-700" },
  other: { label: "Other", icon: Users, grad: "from-slate-400 to-slate-600", badge: "bg-slate-100 text-slate-600" },
};

export function relInfo(rel: string | null | undefined): RelInfo {
  return REL_INFO[(rel ?? "other").toLowerCase().trim()] ?? REL_INFO.other;
}

export function relLabel(rel: string | null | undefined): string {
  return relInfo(rel).label;
}

export function ageOf(dob: string | null | undefined): string | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const years = Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 3600 * 1000));
  return years >= 0 ? `${years} yr` : null;
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function ngn(n: number | string | null | undefined, currency?: string): string {
  const value = Number(n ?? 0);
  const cur = currency || getTenantCurrency() || "NGN";
  if (cur !== "NGN") return new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(value);
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(value);
}

/** Derived portal status: needs attention when allergies present or money owing. */
export function statusOf(m: FamilyMember, outstanding: number): "active" | "needs_attention" {
  if (outstanding > 0.009 || (m.allergies ?? "").trim()) return "needs_attention";
  return "active";
}

/** Outstanding balance from family-scoped invoices (pending + partially paid). */
export function outstandingOf(invoices: Array<{ total_amount: number; paid_amount: number; status: string }>): number {
  return invoices.reduce((sum, inv) => {
    const status = inv.status ?? "";
    if (status === "pending" || status === "partially_paid") {
      return sum + (Number(inv.total_amount) - Number(inv.paid_amount));
    }
    return sum;
  }, 0);
}