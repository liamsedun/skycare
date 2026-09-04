"use client";

import type { StaffRole } from "@/lib/auth";
export interface StaffUser {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  branch_id: string | null;
  branches?: { name: string } | null;
  staff?: {
    id: string;
    staff_number: string;
    department: string | null;
    specialization: string | null;
    license_number: string | null;
    qualification: string | null;
    employment_type: string | null;
    years_of_exp: number | null;
    base_salary: number | null;
    is_available: boolean;
    available_from: string | null;
    available_until: string | null;
    on_leave_until: string | null;
  } | null;
}

export type DutyStatus = "all" | "on_duty" | "off_duty" | "on_leave";

export interface BranchRow {
  id: string;
  name: string;
  code: string | null;
  isMain: boolean;
  isActive: boolean;
}

export const CREATABLE_ROLES: StaffRole[] = [
  "hospital_admin",
  "doctor",
  "nurse",
  "pharmacist",
  "lab_tech",
  "cashier",
  "receptionist",
  "medical_officer",
  "surgeon",
  "anesthesiologist",
  "radiologist",
  "radiographer",
  "physiotherapist",
  "dentist",
  "optometrist",
  "dietician",
  "medical_records",
  "accountant",
  "hr_officer",
  "it_support",
  "security",
  "ward_orderly",
  "hmo_officer",
  "paramedic",
];

export function rolesFor(_myRole?: string): StaffRole[] {
  return CREATABLE_ROLES;
}

export const AVATAR_GRADIENTS = [
  "from-sky-500 to-blue-600",
  "from-violet-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-amber-400 to-orange-500",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-blue-600",
  "from-fuchsia-500 to-purple-600",
];

export function gradientFor(role: string): string {
  if (role === "hospital_admin") return "from-sky-500 to-blue-600";
  const key = [...role].reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[key % AVATAR_GRADIENTS.length];
}

export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}
export const inputCls =
    "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
