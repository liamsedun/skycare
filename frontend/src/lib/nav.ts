import type { LucideIcon } from "lucide-react";
import {
  CalendarClock,
  FlaskConical,
  LayoutDashboard,
  Pill,
  ReceiptText,
  Settings,
  Users,
  UserCog,
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
    roles: ["hospital_admin", "pharmacist", "super_admin"],
    soon: true,
  },
  {
    href: "/app/lab",
    label: "Lab",
    icon: FlaskConical,
    roles: ["hospital_admin", "lab_tech", "super_admin"],
    soon: true,
  },
  {
    href: "/app/billing",
    label: "Billing",
    icon: ReceiptText,
    roles: [...ADMIN, "cashier"],
    soon: true,
  },
  { href: "/app/staff", label: "Staff", icon: UserCog, roles: ADMIN, soon: true },
  { href: "/app/settings", label: "Settings", icon: Settings, roles: ADMIN, soon: true },
];

export function navForRole(role: StaffRole | undefined): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}
