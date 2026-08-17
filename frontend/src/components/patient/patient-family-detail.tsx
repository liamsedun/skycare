"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Baby,
  Banknote,
  CalendarDays,
  CalendarPlus,
  Camera,
  ChevronLeft,
  ClipboardList,
  Droplet,
  HeartPulse,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Stethoscope,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { fileToSquareImage } from "@/lib/square-image";
import {
  AppCard,
  AppHeader,
  AppSegmented,
  AppSkeletonList,
  AppEmpty,
  AppSheet,
  GoldButton,
  GhostButton,
  AppAvatarTile,
  cn,
} from "@/components/patient/mobile/mobile-app-ui";
import {
  BLOOD_GROUPS,
  FamilyMember,
  GENOTYPES,
  RELATIONSHIPS,
  ageOf,
  fmtDate,
  ngn,
  relInfo,
  relLabel,
} from "@/lib/patient-family-shared";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

const recordTypeLabels: Record<string, string> = {
  diagnosis: "Diagnosis",
  lab_result: "Lab result",
  prescription: "Prescription",
  surgery_report: "Surgery report",
  vaccination: "Vaccination",
  imaging: "Imaging",
  progress_note: "Progress note",
  admission_summary: "Admission summary",
  discharge_summary: "Discharge summary",
};

type TabKey = "biodata" | "records" | "bills" | "appointments";

interface MedicalRecord {
  id: string;
  record_type: string;
  title: string | null;
  content: string | null;
  created_at: string;
  users: { full_name: string; role: string } | null;
}

interface DoctorNote {
  id: string;
  visit_date: string | null;
  clinical_findings: string | null;
  treatment_recommendations: string | null;
  diagnosis: Record<string, unknown> | null;
  medications: unknown[] | null;
  created_at: string;
  users: { full_name: string; role: string } | null;
}

interface MedicalReport {
  id: string;
  reference_number: string | null;
  report_date: string | null;
  content: string | null;
  author_name: string | null;
  author_title: string | null;
  created_at: string;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  issue_date: string | null;
  due_date: string | null;
  status: string;
  total_amount: number;
  paid_amount: number;
  created_at: string;
  invoice_items: Array<{ id: string; description: string }>;
}

interface AppointmentRow {
  id: string;
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  type: string;
  status: string;
  reason: string | null;
  patients: { first_name: string; last_name: string } | null;
  users: { full_name: string; role: string } | null;
}

export default function PatientFamilyDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const memberId = params?.id ?? "";

  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [rootId, setRootId] = useState<string | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [member, setMember] = useState<FamilyMember | null>(null);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [notes, setNotes] = useState<DoctorNote[]>([]);
  const [reports, setReports] = useState<MedicalReport[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("biodata");
  const [busy, setBusy] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showRemove, setShowRemove] = useState(false);
  const [payTarget, setPayTarget] = useState<InvoiceRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/patients/me", { cache: "no-store" });
      const meBody = await meRes.json();
      if (!meRes.ok) throw new Error(meBody.error ?? "Failed to load family");
      const rows = (meBody.data?.family ?? []) as FamilyMember[];
      setFamily(rows);
      setRootId(meBody.data?.rootId ?? null);
      setSelfId(meBody.data?.selfId ?? null);
      const target = rows.find((m) => m.id === memberId) ?? null;
      if (!target) {
        setError("That family member is not part of your account.");
        setLoading(false);
        return;
      }
      setMember(target);

      const [recRes, noteRes, repRes, invRes, apptRes] = await Promise.all([
        fetch(`/api/medical-records?patient_id=${memberId}&pageSize=100`, { cache: "no-store" }),
        fetch(`/api/doctor-notes?patient_id=${memberId}&pageSize=100`, { cache: "no-store" }),
        fetch(`/api/medical-reports?patient_id=${memberId}&pageSize=100`, { cache: "no-store" }),
        fetch(`/api/invoices?patient_id=${memberId}&pageSize=200`, { cache: "no-store" }),
        fetch(`/api/appointments?patient_id=${memberId}&pageSize=100`, { cache: "no-store" }),
      ]);
      if (recRes.ok) setRecords(((await recRes.json()).data ?? []) as MedicalRecord[]);
      if (noteRes.ok) setNotes(((await noteRes.json()).data ?? []) as DoctorNote[]);
      if (repRes.ok) setReports(((await repRes.json()).data ?? []) as MedicalReport[]);
      if (invRes.ok) setInvoices(((await invRes.json()).data ?? []) as InvoiceRow[]);
      if (apptRes.ok) setAppointments(((await apptRes.json()).data ?? []) as AppointmentRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load family member");
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    load();
  }, [load]);

  const isMainAccount = selfId !== null && selfId === rootId;
  const canManage = isMainAccount && !!member && !member.is_primary_account;
  const outstanding = invoices.reduce((sum, inv) => {
    const s = inv.status ?? "";
    if (s === "pending" || s === "partially_paid") {
      return sum + (Number(inv.total_amount) - Number(inv.paid_amount));
    }
    return sum;
  }, 0);
  const recordCount = records.length + notes.length + reports.length;

  async function saveEdit(body: Record<string, unknown>) {
    if (!member) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/dependants/${member.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const parsed = await res.json();
      if (!res.ok) throw new Error(parsed.error ?? "Failed to save changes");
      setShowEdit(false);
      setSuccess("Profile saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save changes");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember() {
    if (!member) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dependants/${member.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to remove family member");
      router.push("/patient/family");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove family member");
      setShowRemove(false);
    } finally {
      setBusy(false);
    }
  }

  async function declarePayment(form: FormData) {
    if (!payTarget) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const amount = Number(form.get("amount"));
      const method = form.get("method");
      if (method === "online") {
        const res = await fetch("/api/payments/initialize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: payTarget.id, amount }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to start online payment");
        window.location.href = body.data?.authorization_url ?? "/patient/billing";
        return;
      }
      const res = await fetch("/api/payments/declare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: payTarget.id,
          amount,
          paymentMethod: method === "pos" ? "pos" : "bank_transfer",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to declare payment");
      setPayTarget(null);
      setSuccess(`Payment of ${ngn(amount)} declared — the hospital will confirm it soon.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to declare payment");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="hidden md:block"><AppSkeletonList rows={5} /></div>
        <div className="md:hidden"><AppSkeletonList rows={5} /></div>
      </div>
    );
  }

  if (!member) {
    const msg = error ?? "Family member not found";
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 text-center">
        <Users size={40} aria-hidden="true" className="text-[var(--color-muted-fg)]" />
        <p className="text-sm font-medium text-[var(--color-foreground)]">{msg}</p>
        <Link href="/patient/family" className="focus-ring rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-foreground)] hover:bg-slate-50">
          Back to family
        </Link>
      </div>
    );
  }

  const info = relInfo(member.dependant_relationship);
  const RelIcon = info.icon;
  const siblings = family.filter((m) => m.id !== member.id);
  const first = member.first_name[0] ?? "";
  const second = member.last_name[0] ?? "";

  return (
    <>
      <div className="hidden md:block">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Link href="/patient/family" className="focus-ring -ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-[var(--color-muted-fg)] hover:bg-slate-100">
                <ChevronLeft size={16} /> Family
              </Link>
              <h1 className="mt-1 flex flex-wrap items-baseline gap-x-3 text-2xl font-bold text-[var(--color-foreground)]">
                {member.first_name} {member.last_name}
                <span className="font-mono text-sm font-semibold text-[#e0a84a]">
                  {member.patient_number}
                </span>
              </h1>
            </div>
            {canManage && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowEdit(true)}
                  className="focus-ring inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-foreground)] hover:bg-slate-50"
                >
                  <Pencil size={15} /> Edit details
                </button>
                <button
                  type="button"
                  onClick={() => setShowRemove(true)}
                  className="focus-ring inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3.5 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 size={15} /> Remove
                </button>
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>
          )}
          {success && (
            <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{success}</p>
          )}

          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <div className="space-y-4">
              <ProfileCard member={member} outstanding={outstanding} recordCount={recordCount} appointmentCount={appointments.length} />
              {siblings.length > 0 && <SiblingChips family={family} currentId={member.id} />}
            </div>
            <div className="space-y-4">
              <Tabs
                tab={tab}
                setTab={setTab}
                recordCount={recordCount}
                billCount={invoices.length}
                appointmentCount={appointments.length}
              />
              {tab === "biodata" && <Biodata member={member} />}
              {tab === "records" && <RecordsTab records={records} notes={notes} reports={reports} />}
              {tab === "bills" && (
                <BillsTab
                  invoices={invoices}
                  outstanding={outstanding}
                  onPay={(inv) => setPayTarget(inv)}
                />
              )}
              {tab === "appointments" && <AppointmentsTab appointments={appointments} />}
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile app view (LB parity, <md) ───────────────────────────── */}
      <div className="md:hidden">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Link
              href="/patient/family"
              className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-muted-fg)] transition-colors hover:bg-black/5"
              aria-label="Back to family"
            >
              <ChevronLeft size={20} />
            </Link>
            {canManage && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowEdit(true)}
                  className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-muted-fg)] transition-colors hover:bg-black/5"
                  aria-label="Edit details"
                  title="Edit details"
                >
                  <Pencil size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowRemove(true)}
                  className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full text-rose-500 transition-colors hover:bg-rose-50"
                  aria-label="Remove member"
                  title="Remove member"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            )}
          </div>

          <AppHeader
            title={`${member.first_name} ${member.last_name}`}
            meta={`${member.patient_number} · ${relLabel(member.dependant_relationship)}`}
          />

          {error && (
            <p role="alert" className="rounded-xl bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>
          )}
          {success && (
            <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{success}</p>
          )}

          <ProfileCard member={member} outstanding={outstanding} recordCount={recordCount} appointmentCount={appointments.length} mobile />

          {siblings.length > 0 && <SiblingChips family={family} currentId={member.id} mobile />}

          <AppSegmented<TabKey>
            tabs={[
              { key: "biodata", label: "Biodata" },
              { key: "records", label: `Records (${recordCount})` },
              { key: "bills", label: `Bills (${invoices.length})` },
              { key: "appointments", label: `Appointments (${appointments.length})` },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === "biodata" && <Biodata member={member} mobile />}
          {tab === "records" && <RecordsTab records={records} notes={notes} reports={reports} mobile />}
          {tab === "bills" && (
            <BillsTab
              invoices={invoices}
              outstanding={outstanding}
              onPay={(inv) => setPayTarget(inv)}
              mobile
            />
          )}
          {tab === "appointments" && <AppointmentsTab appointments={appointments} mobile />}
        </div>
      </div>

      {showEdit && member && (
        <EditMemberModal
          member={member}
          busy={busy}
          onClose={() => setShowEdit(false)}
          onSave={saveEdit}
        />
      )}

      <AppSheet
        open={showRemove}
        onClose={() => setShowRemove(false)}
        title={<h3 className="text-base font-semibold text-[var(--color-foreground)]">Remove family member</h3>}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
            <X size={22} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--color-foreground)]">{member.first_name} {member.last_name}</p>
            <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
              Remove them from your family account? Their records remain available to your hospital.
            </p>
          </div>
        </div>
        <div className="mt-5 flex gap-3">
          <GhostButton className="flex-1" onClick={() => setShowRemove(false)}>
            Keep
          </GhostButton>
          <button
            type="button"
            onClick={removeMember}
            disabled={busy}
            className="h-10 flex-1 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-sm font-semibold text-white transition-all hover:shadow-lg disabled:opacity-50"
          >
            {busy ? "Removing…" : "Yes, Remove"}
          </button>
        </div>
      </AppSheet>

      {payTarget && (
        <PayModal
          invoice={payTarget}
          busy={busy}
          onClose={() => setPayTarget(null)}
          onPay={declarePayment}
        />
      )}
    </>
  );
}

function ProfileCard({
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

function StatTile({
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

function SiblingChips({
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

function Tabs({
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

function BioRow({
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

function Biodata({ member, mobile }: { member: FamilyMember; mobile?: boolean }) {
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

function RecordsTab({
  records,
  notes,
  reports,
  mobile,
}: {
  records: MedicalRecord[];
  notes: DoctorNote[];
  reports: MedicalReport[];
  mobile?: boolean;
}) {
  const card = mobile ? "app-glass rounded-2xl p-4" : "rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]";
  if (records.length === 0 && notes.length === 0 && reports.length === 0) {
    return (
      <AppEmpty
        icon={ClipboardList}
        title="No records yet"
        hint="Medical records, doctor notes and reports will appear here."
      />
    );
  }
  return (
    <div className="space-y-4">
      {records.length > 0 && (
        <div className={card}>
          <p className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">Clinical records · {records.length}</p>
          <div className="space-y-2">
            {records.map((rec) => (
              <details key={rec.id} className="group rounded-xl border border-[var(--color-border)] bg-black/[0.02]">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium text-[var(--color-foreground)]">
                  <span className="rounded-full bg-[#e0a84a]/15 px-2 py-0.5 text-[10px] font-bold text-[#e0a84a]">
                    {recordTypeLabels[rec.record_type] ?? rec.record_type.replace(/_/g, " ")}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{rec.title ?? fmtDate(rec.created_at)}</span>
                  <span className="text-[10px] font-normal text-[var(--color-muted-fg)]">{fmtDate(rec.created_at)}</span>
                </summary>
                <div className="border-t border-[var(--color-border)] px-3 py-2.5">
                  {rec.users?.full_name && (
                    <p className="mb-1 text-[11px] font-medium text-[var(--color-primary-dark)]">
                      {rec.users.full_name} · {rec.users.role}
                    </p>
                  )}
                  {rec.content ? (
                    <p className="whitespace-pre-wrap text-xs text-[var(--color-foreground)]">{rec.content}</p>
                  ) : (
                    <p className="text-xs text-[var(--color-muted-fg)]">No details.</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <div className={card}>
          <p className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">Doctor notes · {notes.length}</p>
          <div className="space-y-2">
            {notes.map((note) => {
              const diagnosis = (note.diagnosis ?? {}) as Record<string, unknown>;
              return (
                <details key={note.id} className="group rounded-xl border border-[var(--color-border)] bg-black/[0.02]">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium text-[var(--color-foreground)]">
                    <Stethoscope size={13} className="text-[var(--color-primary)]" />
                    <span className="min-w-0 flex-1 truncate">
                      {fmtDate(note.visit_date ?? note.created_at)}
                      {note.users?.full_name ? ` — ${note.users.full_name}` : ""}
                    </span>
                  </summary>
                  <div className="space-y-1.5 border-t border-[var(--color-border)] px-3 py-2.5 text-xs">
                    {note.clinical_findings && (
                      <p className="text-[var(--color-foreground)]"><span className="font-semibold">Findings: </span>{note.clinical_findings}</p>
                    )}
                    {Object.keys(diagnosis).length > 0 && (
                      <p className="text-[var(--color-foreground)]">
                        <span className="font-semibold">Diagnosis: </span>
                        {String(diagnosis.primary ?? "")}
                        {(Array.isArray(diagnosis.secondary) ? diagnosis.secondary : []).map((d) => String(d)).filter(Boolean).join(", ")}
                      </p>
                    )}
                    {note.treatment_recommendations && (
                      <p className="text-[var(--color-foreground)]"><span className="font-semibold">Treatment: </span>{note.treatment_recommendations}</p>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      )}

      {reports.length > 0 && (
        <div className={card}>
          <p className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">Medical reports · {reports.length}</p>
          <div className="space-y-2">
            {reports.map((rep) => (
              <details key={rep.id} className="group rounded-xl border border-[var(--color-border)] bg-black/[0.02]">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium text-[var(--color-foreground)]">
                  <ClipboardList size={13} className="text-[var(--color-primary)]" />
                  <span className="min-w-0 flex-1 truncate">
                    {rep.reference_number ?? "Report"} · {fmtDate(rep.report_date ?? rep.created_at)}
                  </span>
                </summary>
                <div className="border-t border-[var(--color-border)] px-3 py-2.5">
                  {rep.author_name && (
                    <p className="mb-1 text-[11px] font-medium text-[var(--color-primary-dark)]">
                      {rep.author_name}{rep.author_title ? ` · ${rep.author_title}` : ""}
                    </p>
                  )}
                  {rep.content && (
                    <p className="whitespace-pre-wrap text-xs text-[var(--color-foreground)]">{rep.content}</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BillsTab({
  invoices,
  outstanding,
  onPay,
  mobile,
}: {
  invoices: InvoiceRow[];
  outstanding: number;
  onPay: (inv: InvoiceRow) => void;
  mobile?: boolean;
}) {
  if (invoices.length === 0) {
    return (
      <AppEmpty
        icon={Banknote}
        title="No bills yet"
        hint="Invoices issued for this family member will appear here."
      />
    );
  }
  return (
    <div className="space-y-4">
      <div className={cn("flex items-center justify-between", mobile ? "app-glass rounded-2xl px-4 py-3" : "rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]")}>
        <span className="text-sm font-medium text-[var(--color-foreground)]">Total outstanding</span>
        <span className={cn("text-base font-bold", outstanding > 0 ? "text-rose-500" : "text-emerald-500")}>{ngn(outstanding)}</span>
      </div>
      {invoices.map((inv) => {
        const due = Number(inv.due_date ? new Date(inv.due_date).getTime() : 0);
        const overdue = inv.status === "pending" && due > 0 && due < Date.now();
        const open = inv.status === "pending" || inv.status === "partially_paid";
        return (
          <div key={inv.id} className={cn(mobile ? "app-glass rounded-2xl p-4" : "rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]")}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-mono text-sm font-bold text-[var(--color-foreground)]">{inv.invoice_number}</p>
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", overdue ? "border-rose-500/20 bg-rose-100 text-rose-700" : inv.status === "paid" ? "border-emerald-500/20 bg-emerald-100 text-emerald-700" : "border-amber-500/20 bg-amber-100 text-amber-700")}>
                {overdue ? "Overdue" : inv.status.replace(/_/g, " ")}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--color-muted-fg)]">
              Issued {fmtDate(inv.issue_date ?? inv.created_at)} · {inv.invoice_items.length} item{inv.invoice_items.length === 1 ? "" : "s"}
            </p>
            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-[var(--color-muted-fg)]">
                <p>Total <span className="font-semibold text-[var(--color-foreground)]">{ngn(inv.total_amount)}</span></p>
                {Number(inv.paid_amount) > 0 && (
                  <p>Paid <span className="font-semibold text-emerald-500">{ngn(inv.paid_amount)}</span></p>
                )}
              </div>
              <div className="text-right">
                {open && Number(inv.total_amount) - Number(inv.paid_amount) > 0 && (
                  <button
                    type="button"
                    onClick={() => onPay(inv)}
                    className="focus-ring rounded-lg bg-gradient-to-br from-[#e0a84a] to-amber-500 px-3.5 py-2 text-xs font-semibold text-[#0a0f1a] shadow transition-transform hover:scale-[1.02]"
                  >
                    Pay {ngn(Number(inv.total_amount) - Number(inv.paid_amount))}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AppointmentsTab({
  appointments,
  mobile,
}: {
  appointments: AppointmentRow[];
  mobile?: boolean;
}) {
  if (appointments.length === 0) {
    return (
      <div className="space-y-3">
        <AppEmpty
          icon={CalendarDays}
          title="No appointments yet"
          hint="Book an appointment from the Appointments page."
        />
        <Link
          href="/patient/appointments"
          className="focus-ring flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#e0a84a]/40 py-3.5 text-sm font-semibold text-[#e0a84a] transition-colors hover:border-[#e0a84a]"
        >
          <CalendarPlus size={16} aria-hidden="true" /> Book Appointment
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Link
        href="/patient/appointments"
        className="focus-ring flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#e0a84a]/40 py-3.5 text-sm font-semibold text-[#e0a84a] transition-colors hover:border-[#e0a84a]"
      >
        <CalendarPlus size={16} aria-hidden="true" /> Book Appointment
      </Link>
      {appointments.map((appt) => (
        <div key={appt.id} className={cn(mobile ? "app-glass rounded-2xl p-4" : "rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]")}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--color-foreground)]">
                {fmtDate(appt.scheduled_date)} · {appt.start_time ?? "—"}
              </p>
              <p className="mt-0.5 text-xs capitalize text-[var(--color-muted-fg)]">{appt.type} — {appt.users?.full_name ?? "Staff"}</p>
              {appt.reason && <p className="mt-1 truncate text-xs text-[var(--color-muted-fg)]">{appt.reason}</p>}
            </div>
            <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold", appt.status === "completed" ? "border-emerald-500/20 bg-emerald-100 text-emerald-700" : appt.status === "cancelled" ? "border-rose-500/20 bg-rose-100 text-rose-700" : "border-amber-500/20 bg-amber-100 text-amber-700")}>
              {appt.status.replace(/_/g, " ")}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function EditMemberModal({
  member,
  busy,
  onClose,
  onSave,
}: {
  member: FamilyMember;
  busy: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      setPhoto(await fileToSquareImage(file));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Could not read that image");
    } finally {
      setPhotoBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Edit Dependant"
    >
      <div className="my-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Edit Dependant</h2>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const body: Record<string, unknown> = {
              first_name: fd.get("firstName"),
              last_name: fd.get("lastName"),
              gender: fd.get("gender") === "Female" ? "female" : fd.get("gender") === "Male" ? "male" : "other",
              date_of_birth: fd.get("dateOfBirth") || null,
              phone: fd.get("phone") || null,
              email: fd.get("email") || null,
              blood_group: fd.get("bloodGroup") || null,
              genotype: fd.get("genotype") || null,
              allergies: fd.get("allergies") || null,
              dependant_relationship: String(fd.get("relationship") ?? "other").toLowerCase(),
            };
            if (photo) body.avatar = photo;
            else if (!member.avatar_url && fd.get("clearPhoto") === "1") body.avatar = null;
            onSave(body);
          }}
        >
          <div className="flex items-center gap-4">
            <div className="relative">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="Avatar preview" className="h-20 w-20 rounded-2xl object-cover ring-2 ring-[#e0a84a]" />
              ) : member.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={member.avatar_url} alt={member.first_name} className="h-20 w-20 rounded-2xl object-cover ring-2 ring-[#e0a84a]" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0b2a4a] to-[#0d5f7a] text-[#e0a84a]">
                  <Camera size={26} aria-hidden="true" />
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={photoBusy}
                className="focus-ring absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#e0a84a] to-amber-500 text-[#0a0f1a] shadow-md disabled:opacity-60"
                aria-label="Upload photo"
              >
                {photoBusy ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#0a0f1a]/40 border-t-[#0a0f1a]" /> : <Camera size={13} />}
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleFile} />
            </div>
            <div className="min-w-0 flex-1 text-xs text-[var(--color-muted-fg)]">
              {member.avatar_url && !photo && (
                <label className="flex items-center gap-1.5 font-medium text-rose-500">
                  <input type="checkbox" name="clearPhoto" value="1" className="h-3.5 w-3.5 accent-rose-500" /> Remove current photo
                </label>
              )}
              <span className="mt-0.5 block text-[11px] text-amber-500">{photoError ?? "JPG or PNG — max 2 MB"}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="firstName" required defaultValue={member.first_name} placeholder="First name" className={inputCls} />
            <input name="lastName" required defaultValue={member.last_name} placeholder="Last name" className={inputCls} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="ed-dob">Date of birth</label>
              <input id="ed-dob" name="dateOfBirth" type="date" defaultValue={member.date_of_birth?.slice(0, 10) ?? ""} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="ed-sex">Sex</label>
              <select id="ed-sex" name="gender" className={inputCls} defaultValue={member.gender ? member.gender[0]?.toUpperCase() + member.gender.slice(1) : ""}>
                <option value="">Select…</option>
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="ed-blood">Blood group</label>
              <select id="ed-blood" name="bloodGroup" className={inputCls} defaultValue={member.blood_group ?? ""}>
                <option value="">Select…</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>{bg}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="ed-geno">Genotype</label>
              <select id="ed-geno" name="genotype" className={inputCls} defaultValue={member.genotype ?? ""}>
                <option value="">Select…</option>
                {GENOTYPES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="ed-rel">Relationship</label>
              <select id="ed-rel" name="relationship" className={inputCls} defaultValue={member.dependant_relationship ?? "other"}>
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r.toLowerCase()}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="ed-phone">Phone</label>
              <input id="ed-phone" name="phone" type="tel" defaultValue={member.phone ?? ""} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="ed-email">Email</label>
            <input id="ed-email" name="email" type="email" defaultValue={member.email ?? ""} className={inputCls} />
          </div>

          <div>
            <label className={labelCls} htmlFor="ed-allergies">Allergies</label>
            <textarea id="ed-allergies" name="allergies" rows={2} defaultValue={member.allergies ?? ""} className={inputCls} placeholder="e.g. penicillin, latex — leave blank if none" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="focus-ring flex-1 rounded-lg bg-gradient-to-br from-[#e0a84a] to-amber-500 py-2.5 text-sm font-semibold text-[#0a0f1a] shadow-md transition-transform hover:scale-[1.01] disabled:opacity-60">
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PayModal({
  invoice,
  busy,
  onClose,
  onPay,
}: {
  invoice: InvoiceRow;
  busy: boolean;
  onClose: () => void;
  onPay: (form: FormData) => void;
}) {
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; bank_name: string; account_name: string | null; account_number: string | null }>>([]);
  const [gateway, setGateway] = useState<{ enabled: boolean } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const outstanding = Math.max(0, Number(invoice.total_amount) - Number(invoice.paid_amount));

  useEffect(() => {
    fetch("/api/settings/bank-accounts", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => {
        if (b.data) setBankAccounts(b.data);
      })
      .catch(() => {});
    fetch("/api/payments/gateway-status", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setGateway(b.data ?? null))
      .catch(() => {});
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Pay invoice"
    >
      <div className="my-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Pay {invoice.invoice_number}</h2>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {loadErr && (
          <p className="mt-3 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{loadErr}</p>
        )}
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onPay(new FormData(e.currentTarget));
          }}
        >
          <div>
            <label className={labelCls} htmlFor="pay-amount">Amount</label>
            <input
              id="pay-amount"
              name="amount"
              type="number"
              min="1"
              step="0.01"
              max={outstanding}
              defaultValue={outstanding}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-[var(--color-muted-fg)]">Outstanding: {ngn(outstanding)}</p>
          </div>
          <div>
            <label className={labelCls} htmlFor="pay-method">Payment method</label>
            <select id="pay-method" name="method" className={inputCls} defaultValue={gateway?.enabled ? "online" : bankAccounts.length > 0 ? "bank_transfer" : "pos"}>
              {gateway?.enabled && <option value="online">Pay online (card)</option>}
              <option value="bank_transfer">Bank transfer</option>
              <option value="pos">POS / cash at the hospital</option>
            </select>
            {bankAccounts.length > 0 && (
              <p className="mt-1.5 text-xs text-[var(--color-muted-fg)]">
                Bank transfer details:{" "}
                {bankAccounts.map((b) => `${b.bank_name} ${b.account_number ?? ""} (${b.account_name ?? "—"})`).join(" · ")}
              </p>
            )}
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="focus-ring flex-1 rounded-lg bg-gradient-to-br from-[#e0a84a] to-amber-500 py-2.5 text-sm font-semibold text-[#0a0f1a] shadow-md transition-transform hover:scale-[1.01] disabled:opacity-60">
              {busy ? "Sending…" : "Declare payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}