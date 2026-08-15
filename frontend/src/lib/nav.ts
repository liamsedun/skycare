import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BedDouble,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CreditCard,
  Download,
  DoorOpen,
  FlaskConical,
  FileText,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Pill,
  ReceiptText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  UserCircle,
  Users,
  UserCog,
  Wallet,
  Package,
  Building2,
  Tag,
  TestTube,
  Clock,
  Landmark,
} from "lucide-react";
import type { StaffRole } from "@/lib/auth";

export interface NavItem {
  /** Stable module identifier used for per-user module access grants. */
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles allowed to see this item. Undefined = any staff role. */
  roles?: StaffRole[];
  /** Module is planned but not built yet — rendered as a disabled "Soon" entry. */
  soon?: boolean;
  /** Sub-items rendered as an expandable group under this item. */
  children?: NavItem[];
}

const ADMIN = ["hospital_admin", "super_admin"] as StaffRole[];
const CLINICAL = ["hospital_admin", "doctor", "nurse"] as StaffRole[];
const PHARM_TEAM = ["hospital_admin", "super_admin", "pharmacist"] as StaffRole[];
const HR_ADMIN = ["hospital_admin", "hr_officer", "super_admin"] as StaffRole[];
const HR_FINANCE = ["hospital_admin", "hr_officer", "accountant", "super_admin"] as StaffRole[];

/** Personal/system pages that are never hidden by module access (still role-gated). */
export const ALWAYS_VISIBLE_KEYS = new Set(["account", "download", "profile", "settings"]);

/** Access level for a module key. */
export type AccessLevel = "full" | "view_only" | "none";

/** Per-user module access map: nav key -> level. Missing key = none. NULL = role default. */
export type ModuleAccess = Record<string, AccessLevel> | null | undefined;

export function accessLevelOf(access: ModuleAccess, key: string): AccessLevel {
  if (!access) return "full";
  return access[key] ?? "none";
}

export const NAV_ITEMS: NavItem[] = [
  { key: "overview", href: "/app", label: "Overview", icon: LayoutDashboard },
  {
    key: "appointments",
    href: "/app/appointments",
    label: "Appointments",
    icon: CalendarClock,
    roles: ["hospital_admin", "doctor", "nurse", "receptionist", "super_admin"],
  },
  { key: "patients", href: "/app/patients", label: "Patients", icon: Users },
  {
    key: "pharmacy",
    href: "/app/pharmacy",
    label: "Pharmacy",
    icon: Pill,
    roles: ["hospital_admin", "pharmacist", "doctor", "nurse", "super_admin"],
    children: [
      { key: "pharmacy-dashboard", href: "/app/pharmacy/dashboard", label: "Pharmacy Dashboard", icon: LayoutDashboard },
      { key: "pharmacy-prescriptions", href: "/app/pharmacy/prescriptions", label: "Prescriptions", icon: FileText },
      { key: "pharmacy-inventory", href: "/app/pharmacy/inventory", label: "Drug Inventory", icon: Package },
      { key: "pharmacy-billing", href: "/app/pharmacy/billing", label: "Billing & Sales", icon: ReceiptText, roles: [...PHARM_TEAM, "cashier"] },
      { key: "pharmacy-suppliers", href: "/app/pharmacy/suppliers", label: "Suppliers & POs", icon: Building2, roles: PHARM_TEAM },
      { key: "pharmacy-prices", href: "/app/pharmacy/prices", label: "Branch Prices", icon: Tag, roles: ADMIN },
      { key: "pharmacy-compliance", href: "/app/pharmacy/compliance", label: "NAFDAC & Compliance", icon: ShieldCheck, roles: PHARM_TEAM },
    ],
  },
  {
    key: "lab",
    href: "/app/lab",
    label: "Lab",
    icon: FlaskConical,
    roles: ["hospital_admin", "lab_tech", "doctor", "nurse", "super_admin"],
    children: [
      { key: "lab-dashboard", href: "/app/lab/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["hospital_admin", "lab_tech", "super_admin"] },
      { key: "lab-requests", href: "/app/lab/requests", label: "Requests", icon: FileText },
      { key: "lab-services", href: "/app/lab/services", label: "Services", icon: TestTube },
      { key: "lab-income", href: "/app/lab/income", label: "Services Income", icon: TrendingUp, roles: ["hospital_admin", "lab_tech", "super_admin"] },
    ],
  },
  {
    key: "wards",
    href: "/app/wards",
    label: "Wards",
    icon: BedDouble,
    roles: ["hospital_admin", "doctor", "nurse", "receptionist", "super_admin"],
    children: [
      { key: "wards-dashboard", href: "/app/wards/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { key: "wards-bed-map", href: "/app/wards/bed-map", label: "Bed Map", icon: BedDouble },
      { key: "wards-admissions", href: "/app/wards/admissions", label: "Admissions", icon: FileText },
      { key: "wards-rounds", href: "/app/wards/rounds", label: "Ward Rounds", icon: Activity },
      { key: "wards-discharges", href: "/app/wards/discharges", label: "Discharges", icon: DoorOpen },
    ],
  },
  { key: "billing", href: "/app/billing", label: "Billing", icon: ReceiptText, roles: [...ADMIN, "cashier"] },
  { key: "banking", href: "/app/banking", label: "Banking", icon: Landmark, roles: [...ADMIN, "cashier", "accountant"] },
  { key: "expenses", href: "/app/expenses", label: "Expenses", icon: Wallet, roles: ADMIN },
  { key: "other-income", href: "/app/other-income", label: "Other Income", icon: TrendingUp, roles: ADMIN },
  { key: "staff", href: "/app/staff", label: "Staff", icon: UserCog, roles: ADMIN },
  { key: "leave", href: "/app/leave", label: "Leave", icon: CalendarDays },
  {
    key: "hr",
    href: "/app/hr",
    label: "HR",
    icon: UserCog,
    children: [
      { key: "hr-dashboard", href: "/app/hr", label: "HR Dashboard", icon: LayoutDashboard },
      { key: "hr-staff", href: "/app/hr/staff", label: "Staff Profiles", icon: UserCog, roles: HR_ADMIN },
      { key: "hr-roster", href: "/app/hr/roster", label: "Shifts & Roster", icon: CalendarRange, roles: HR_ADMIN },
      { key: "hr-attendance", href: "/app/hr/attendance", label: "Attendance", icon: Clock },
      { key: "hr-credentials", href: "/app/hr/credentials", label: "Credentials", icon: ShieldCheck, roles: HR_ADMIN },
    ],
  },
  {
    key: "payroll",
    href: "/app/hr/payroll",
    label: "Payroll",
    icon: Wallet,
    roles: HR_FINANCE,
    children: [
      { key: "hr-payroll", href: "/app/hr/payroll", label: "Payroll Runs", icon: Wallet, roles: HR_FINANCE },
      { key: "hr-paye-schedule", href: "/app/hr/payroll/paye-schedule", label: "PAYE Schedule", icon: FileText, roles: HR_FINANCE },
      { key: "hr-pension-schedule", href: "/app/hr/payroll/pension-schedule", label: "Pension Schedule", icon: Landmark, roles: HR_FINANCE },
      { key: "hr-payslips", href: "/app/hr/payroll/payslips", label: "Payslips", icon: ReceiptText, roles: HR_FINANCE },
    ],
  },
  { key: "mail", href: "/app/mail", label: "Mail", icon: Mail, roles: ADMIN },
  { key: "chats", href: "/app/chats", label: "Chats", icon: MessageSquare, roles: ADMIN },
  { key: "reports", href: "/app/reports", label: "Medical Reports", icon: FileText, roles: [...CLINICAL, "super_admin"] },
  { key: "financial-reports", href: "/app/financial-reports", label: "Financial Reports", icon: TrendingUp, roles: ADMIN },
  { key: "audit-logs", href: "/app/audit-logs", label: "Audit Logs", icon: ShieldCheck, roles: ADMIN },
  { key: "account", href: "/app/account", label: "Account", icon: SlidersHorizontal },
  { key: "subscription", href: "/app/subscription", label: "Subscription", icon: CreditCard, roles: ADMIN },
  { key: "download", href: "/app/download", label: "Download App", icon: Download },
  { key: "profile", href: "/app/profile", label: "Profile", icon: UserCircle },
  { key: "settings", href: "/app/settings", label: "Settings", icon: Settings, roles: ADMIN },
];

/**
 * All keys that can appear in a user's module_access map — both top-level
 * modules and their submenus (children are configured individually).
 * Personal/system pages (ALWAYS_VISIBLE_KEYS) are excluded — never grantable.
 */
export const MODULE_KEYS = NAV_ITEMS.flatMap((i) => [i.key, ...(i.children?.map((c) => c.key) ?? [])]).filter(
  (k) => !ALWAYS_VISIBLE_KEYS.has(k)
);

/**
 * Nav items for a user: role-gated, then intersected with the user's module
 * access. When moduleAccess is null/undefined the role defaults apply.
 * A module with submenus stays visible while the parent itself or any of its
 * children has a non-none level; each child is filtered by its own level.
 */
export function navForRole(role: StaffRole | undefined, moduleAccess: ModuleAccess): NavItem[] {
  if (!role) return [];
  // NULL/undefined = role default (all role-allowed items). Any record — even
  // an empty object — is a custom grant map where missing keys mean "none".
  const access = moduleAccess != null ? moduleAccess : null;

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.roles && !item.roles.includes(role)) return false;
    if (!access) return true; // role default
    if (ALWAYS_VISIBLE_KEYS.has(item.key)) return true;
    if (item.children && item.children.length > 0) {
      const anyChildVisible = item.children.some((c) => accessLevelOf(access, c.key) !== "none");
      return accessLevelOf(access, item.key) !== "none" || anyChildVisible;
    }
    return accessLevelOf(access, item.key) !== "none";
  });

  // With a custom access record, prune children individually (each submenu is
  // configured separately). Role default passes children through untouched.
  if (!access) return visibleItems;
  return visibleItems.map((item) => {
    if (!item.children || item.children.length === 0) return item;
    const children = item.children.filter((c) => {
      if (c.roles && !c.roles.includes(role)) return false;
      return ALWAYS_VISIBLE_KEYS.has(c.key) || accessLevelOf(access, c.key) !== "none";
    });
    return children.length === item.children.length ? item : { ...item, children };
  });
}
