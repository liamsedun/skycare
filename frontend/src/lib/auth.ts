export const STAFF_ROLES = [
  "super_admin",
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
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
export type AppRole = StaffRole | "patient_api";

/** Roles that can take appointments / see patients as the attending clinician. */
export const CLINICIAN_ROLES: readonly StaffRole[] = [
  "doctor",
  "medical_officer",
  "surgeon",
  "anesthesiologist",
  "radiologist",
  "radiographer",
  "physiotherapist",
  "dentist",
  "optometrist",
  "dietician",
  "paramedic",
];

export interface AuthClaims {
  tenantId: string | null;
  branchId: string | null;
  role: AppRole | undefined;
}

/** JWT claims are set in app_metadata by tenant-onboarding / user-management. */
export function getClaims(user: {
  app_metadata?: Record<string, unknown>;
} | null): AuthClaims {
  const meta = user?.app_metadata ?? {};
  const tenantId = meta.tenant_id;
  const branchId = meta.branch_id;
  const role = meta.role;
  return {
    tenantId: typeof tenantId === "string" ? tenantId : null,
    branchId: typeof branchId === "string" ? branchId : null,
    role: isAppRole(role) ? role : undefined,
  };
}

export function isStaffRole(role: unknown): role is StaffRole {
  return (
    typeof role === "string" && (STAFF_ROLES as readonly string[]).includes(role)
  );
}

export function isAppRole(role: unknown): role is AppRole {
  return (
    isStaffRole(role) ||
    (typeof role === "string" && role === "patient_api")
  );
}

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  hospital_admin: "Hospital Admin",
  doctor: "Doctor",
  nurse: "Nurse",
  pharmacist: "Pharmacist",
  lab_tech: "Lab Technician",
  cashier: "Cashier",
  receptionist: "Receptionist",
  medical_officer: "Medical Officer",
  surgeon: "Surgeon",
  anesthesiologist: "Anesthesiologist",
  radiologist: "Radiologist",
  radiographer: "Radiographer",
  physiotherapist: "Physiotherapist",
  dentist: "Dentist",
  optometrist: "Optometrist",
  dietician: "Dietician",
  medical_records: "Medical Records Officer",
  accountant: "Accountant",
  hr_officer: "HR Officer",
  it_support: "IT Support",
  security: "Security",
  ward_orderly: "Ward Orderly",
  hmo_officer: "HMO Officer",
  paramedic: "Paramedic",
  patient_api: "Patient",
};

import { getTenantCurrency } from "@/lib/currency";

/** Formats an amount in the tenant's currency. */
export function ngn(amount: number, currency?: string): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currency || getTenantCurrency() || "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  return new Intl.DateTimeFormat("en-NG", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, h, m));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
