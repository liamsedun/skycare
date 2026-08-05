import type { LucideIcon } from "lucide-react";
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  FlaskConical,
  FileText,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Pill,
  ReceiptText,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserCircle,
  Users,
  UserCog,
  Wallet,
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
}

const ADMIN = ["hospital_admin", "super_admin"] as StaffRole[];
const CLINICAL = ["hospital_admin", "doctor", "nurse"] as StaffRole[];

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
  },
  {
    href: "/app/lab",
    label: "Lab",
    icon: FlaskConical,
    roles: ["hospital_admin", "lab_tech", "doctor", "nurse", "super_admin"],
  },
  { href: "/app/billing", label: "Billing", icon: ReceiptText, roles: [...ADMIN, "cashier"] },
  { href: "/app/expenses", label: "Expenses", icon: Wallet, roles: ADMIN },
  { href: "/app/other-income", label: "Other income", icon: TrendingUp, roles: ADMIN },
  { href: "/app/staff", label: "Staff", icon: UserCog, roles: ADMIN },
  { href: "/app/leave", label: "Leave", icon: CalendarDays },
  { href: "/app/roster", label: "Roster", icon: CalendarRange },
  { href: "/app/mail", label: "Mail", icon: Mail, roles: ADMIN },
  { href: "/app/chats", label: "Chats", icon: MessageSquare, roles: ADMIN },
  { href: "/app/reports", label: "Reports", icon: FileText, roles: [...CLINICAL, "super_admin"] },
  { href: "/app/audit-logs", label: "Audit Logs", icon: ShieldCheck, roles: ADMIN },
  { href: "/app/profile", label: "Profile", icon: UserCircle },
  { href: "/app/settings", label: "Settings", icon: Settings, roles: ADMIN },
];

export function navForRole(role: StaffRole | undefined): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}
