import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { AppAvatarTile, cn } from "@/components/patient/mobile/mobile-app-ui";
import { FamilyMember, relInfo, ngn } from "@/lib/patient-family-shared";
import { type TabKey } from "./patient-family-detail-shared";

export function ProfileCard({
  member,
  outstanding,
  recordCount,
  appointmentCount,
  mobile,
}: {
  member: FamilyMember;
  outstanding: number;
  recordCount: number;
  appointmentCount: number;
  mobile?: boolean;
}) {
  const info = relInfo(member.dependant_relationship);
  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b2a4a] to-[#0d5f7a] text-white shadow-lg">
      <div className="p-5">
        <div className="flex items-center gap-4">
          <AppAvatarTile avatarUrl={member.avatar_url} name={`${member.first_name} ${member.last_name}`} size="h-16 w-16 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{member.first_name} {member.last_name}</p>
            <p className="font-mono text-xs text-[#e0a84a]">{member.patient_number}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-[#e0a84a]/20 px-2.5 py-0.5 text-[10px] font-semibold text-[#e0a84a]">
                {member.is_primary_account ? "Primary holder" : info.label}
              </span>
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold">
                {member.gender ? member.gender[0]?.toUpperCase() + member.gender.slice(1) : "—"}
              </span>
              {!(member.allergies ?? "").trim() && outstanding <= 0 && (
                <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                  Active
                </span>
              )}
            </div>
          </div>
        </div>

        {(member.allergies ?? "").trim() && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-400/15 px-3 py-2 text-xs font-medium text-amber-300">
            <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>Known allergies: {member.allergies}</span>
          </p>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2">
          <StatTile label="Outstanding" value={ngn(outstanding)} tone={outstanding > 0 ? "rose" : "emerald"} mobile={mobile} />
          <StatTile label="Records" value={String(recordCount)} tone="sky" mobile={mobile} />
          <StatTile label="Appointments" value={String(appointmentCount)} tone="sky" mobile={mobile} />
        </div>
      </div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  tone,
  mobile,
}: {
  label: string;
  value: string;
  tone: "rose" | "emerald" | "sky";
  mobile?: boolean;
}) {
  const color =
    tone === "rose" ? "text-rose-300" : tone === "emerald" ? "text-emerald-300" : "text-sky-200";
  return (
    <div className={cn("rounded-xl bg-white/[0.07] px-2 py-2 text-center", mobile && "px-1.5 py-1.5")}>
      <p className={cn("truncate text-sm font-bold", color)}>{value}</p>
      <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-white/60">{label}</p>
    </div>
  );
}

export function SiblingChips({
  family,
  currentId,
  mobile,
}: {
  family: FamilyMember[];
  currentId: string;
  mobile?: boolean;
}) {
  return (
    <div className={cn("flex gap-2 overflow-x-auto py-1", mobile ? "-mx-1 px-1" : "")}>
      {family.map((m) => {
        const active = m.id === currentId;
        return (
          <Link
            key={m.id}
            href={`/patient/family/${m.id}`}
            className={cn(
              "focus-ring inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-[#e0a84a] bg-[#e0a84a]/10 text-[#e0a84a]"
                : "border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-black/[0.03]"
            )}
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-[#0b2a4a] to-[#0d5f7a] text-[8px] font-bold text-[#e0a84a]">
              {m.first_name[0] ?? ""}
            </span>
            {m.first_name}
          </Link>
        );
      })}
    </div>
  );
}

export function Tabs({
  tab,
  setTab,
  recordCount,
  billCount,
  appointmentCount,
}: {
  tab: TabKey;
  setTab: (t: TabKey) => void;
  recordCount: number;
  billCount: number;
  appointmentCount: number;
}) {
  const items: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: "biodata", label: "Biodata" },
    { key: "records", label: "Medical Records", count: recordCount },
    { key: "bills", label: "Bills", count: billCount },
    { key: "appointments", label: "Appointments", count: appointmentCount },
  ];
  return (
    <div className="flex gap-1 rounded-xl border border-[var(--color-border)] bg-white p-1 shadow-[var(--shadow-sm)]">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => setTab(item.key)}
          className={cn(
            "focus-ring flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            tab === item.key
              ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]"
              : "text-[var(--color-muted-fg)] hover:bg-slate-50"
          )}
        >
          {item.label}
          {typeof item.count === "number" && item.count > 0 && (
            <span className={cn("ml-1.5 rounded-full px-1.5 text-[10px] font-bold", tab === item.key ? "bg-[var(--color-primary)]/15 text-[var(--color-primary-dark)]" : "bg-slate-100 text-[var(--color-muted-fg)]")}>
              {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
