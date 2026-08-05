import type { LucideIcon } from "lucide-react";
import {
  CalendarClock,
  FileText,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  ReceiptText,
  Users,
} from "lucide-react";

export interface PatientNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const PATIENT_NAV_ITEMS: PatientNavItem[] = [
  { href: "/patient", label: "Overview", icon: LayoutDashboard },
  { href: "/patient/appointments", label: "Appointments", icon: CalendarClock },
  { href: "/patient/billing", label: "Bills & payments", icon: ReceiptText },
  { href: "/patient/prescriptions", label: "Prescriptions", icon: FileText },
  { href: "/patient/lab-results", label: "Lab results", icon: FlaskConical },
  { href: "/patient/family", label: "Family", icon: Users },
];
