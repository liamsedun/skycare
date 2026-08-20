import {
  AlertTriangle,
  Baby,
  CalendarDays,
  Droplet,
  HeartPulse,
  Mail,
  MapPin,
  Phone,
  User,
  Users,
} from "lucide-react";
import { cn } from "@/components/patient/mobile/mobile-app-ui";
import { FamilyMember, ageOf, fmtDate, relLabel } from "@/lib/patient-family-shared";

export function BioRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof User;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]">
        <Icon size={15} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">{label}</p>
        {href ? (
          <a href={href} className="focus-ring text-sm font-semibold text-blue-600 hover:underline">{value}</a>
        ) : (
          <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">{value}</p>
        )}
      </div>
    </div>
  );
}

export function Biodata({ member, mobile }: { member: FamilyMember; mobile?: boolean }) {
  const rows: Array<{ icon: typeof User; label: string; value: string; href?: string }> = [
    { icon: User, label: "Patient number", value: member.patient_number },
    { icon: CalendarDays, label: "Date of birth", value: fmtDate(member.date_of_birth) },
    { icon: Users, label: "Age · Gender", value: `${ageOf(member.date_of_birth) ?? "—"} · ${member.gender ?? "—"}` },
    { icon: HeartPulse, label: "Relationship", value: member.is_primary_account ? "Primary holder" : relLabel(member.dependant_relationship) },
    { icon: Droplet, label: "Blood group", value: member.blood_group ?? "—" },
    { icon: Baby, label: "Genotype", value: member.genotype ?? "—" },
    { icon: AlertTriangle, label: "Allergies", value: (member.allergies ?? "").trim() || "None recorded" },
    { icon: Phone, label: "Phone", value: member.phone ?? "—", href: member.phone ? `tel:${member.phone}` : undefined },
    { icon: Mail, label: "Email", value: member.email ?? "—", href: member.email ? `mailto:${member.email}` : undefined },
    { icon: MapPin, label: "Address", value: [member.address, member.city, member.state].filter(Boolean).join(", ") || "—" },
  ];
  return (
    <div className={cn(mobile ? "app-glass" : "rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]")}>
      <p className="mb-1 text-sm font-semibold text-[var(--color-foreground)]">Biodata</p>
      <div className={cn("divide-y divide-[var(--color-border)]", mobile && "divide-black/5")}>
        {rows.map((row) => (
          <BioRow key={row.label} {...row} />
        ))}
      </div>
    </div>
  );
}
