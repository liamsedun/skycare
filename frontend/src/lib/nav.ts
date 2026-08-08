import type { LucideIcon } from "lucide-react";
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CreditCard,
  Download,
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
} from "lucide-react";
import type { StaffRole } from "@/lib/auth";

export interface NavItem {
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

export const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  {
    href: "/app/appointments",
    label: "Appointments",
    icon: CalendarClock,
    roles: ["hospital_admin", "doctor", "nurse", "receptionist", "super_admin"],
  },
  { href: "/app/patients", label: "Patients", icon: Users },
  {
    href: "/app/pharmacy",
    label: "Pharmacy",
    icon: Pill,
    roles: ["hospital_admin", "pharmacist", "doctor", "nurse", "super_admin"],
    children: [
      { href: "/app/pharmacy/dashboard", label: "Pharmacy Dashboard", icon: LayoutDashboard },
      { href: "/app/pharmacy/prescriptions", label: "Prescriptions", icon: FileText },
      { href: "/app/pharmacy/inventory", label: "Drug Inventory", icon: Package },
      { href: "/app/pharmacy/billing", label: "Billing & Sales", icon: ReceiptText, roles: [...PHARM_TEAM, "cashier"] },
      { href: "/app/pharmacy/suppliers", label: "Suppliers & POs", icon: Building2, roles: PHARM_TEAM },
      { href: "/app/pharmacy/prices", label: "Branch Prices", icon: Tag, roles: ADMIN },
      { href: "/app/pharmacy/compliance", label: "NAFDAC & Compliance", icon: ShieldCheck, roles: PHARM_TEAM },
    ],
  },
  {
    href: "/app/lab",
    label: "Lab",
    icon: FlaskConical,
    roles: ["hospital_admin", "lab_tech", "doctor", "nurse", "super_admin"],
    children: [
      { href: "/app/lab/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["hospital_admin", "lab_tech", "super_admin"] },
      { href: "/app/lab/requests", label: "Requests", icon: FileText },
      { href: "/app/lab/services", label: "Services", icon: TestTube },
      { href: "/app/lab/income", label: "Services Income", icon: TrendingUp, roles: ["hospital_admin", "lab_tech", "super_admin"] },
    ],
  },
  { href: "/app/billing", label: "Billing", icon: ReceiptText, roles: [...ADMIN, "cashier"] },
  { href: "/app/expenses", label: "Expenses", icon: Wallet, roles: ADMIN },
  { href: "/app/other-income", label: "Other Income", icon: TrendingUp, roles: ADMIN },
  { href: "/app/staff", label: "Staff", icon: UserCog, roles: ADMIN },
  { href: "/app/leave", label: "Leave", icon: CalendarDays },
  { href: "/app/roster", label: "Roster", icon: CalendarRange },
  { href: "/app/mail", label: "Mail", icon: Mail, roles: ADMIN },
  { href: "/app/chats", label: "Chats", icon: MessageSquare, roles: ADMIN },
  { href: "/app/reports", label: "Medical Reports", icon: FileText, roles: [...CLINICAL, "super_admin"] },
  { href: "/app/financial-reports", label: "Financial Reports", icon: TrendingUp, roles: ADMIN },
  { href: "/app/audit-logs", label: "Audit Logs", icon: ShieldCheck, roles: ADMIN },
  { href: "/app/account", label: "Account", icon: SlidersHorizontal },
  { href: "/app/subscription", label: "Subscription", icon: CreditCard, roles: ADMIN },
  { href: "/app/download", label: "Download App", icon: Download },
  { href: "/app/profile", label: "Profile", icon: UserCircle },
  { href: "/app/settings", label: "Settings", icon: Settings, roles: ADMIN },
];

export function navForRole(role: StaffRole | undefined): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}
