import type { LucideIcon } from "lucide-react";
import {
  Bell,
  CalendarClock,
  FileText,
  FlaskConical,
  FolderOpen,
  Mail,
  LayoutDashboard,
  MessageSquare,
  ReceiptText,
  User,
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
  { href: "/patient/records", label: "Medical records", icon: FolderOpen },
  { href: "/patient/family", label: "Family", icon: Users },
  { href: "/patient/chats", label: "Chats", icon: MessageSquare },
  { href: "/patient/internal-mail", label: "Messages", icon: Mail },
  { href: "/patient/notifications", label: "Notifications", icon: Bell },
  { href: "/patient/profile", label: "Profile", icon: User },
];
