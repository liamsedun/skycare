"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Pencil, Trash2, Users, X } from "lucide-react";
import { mutedFg, errorBanner, flexBetween, cardTitle, mutedXsMt } from "@/lib/ui-constants";
import {
  AppHeader,
  AppSegmented,
  AppSkeletonList,
  AppSheet,
  GhostButton,
} from "@/components/patient/mobile/mobile-app-ui";
import { FamilyMember, ngn, relInfo, relLabel } from "@/lib/patient-family-shared";
import {
  type AppointmentRow,
  type DoctorNote,
  type InvoiceRow,
  type MedicalRecord,
  type MedicalReport,
  type TabKey,
} from "./patient-family-detail/patient-family-detail-shared";
import { ProfileCard, SiblingChips, Tabs } from "./patient-family-detail/patient-family-detail-cards";
import { Biodata } from "./patient-family-detail/patient-family-detail-biodata";
import { AppointmentsTab, BillsTab, RecordsTab } from "./patient-family-detail/patient-family-detail-tabs";
import { EditMemberModal, PayModal } from "./patient-family-detail/patient-family-detail-modals";

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
        <Users size={40} aria-hidden="true" className={mutedFg} />
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
            <p role="alert" className={errorBanner}>{error}</p>
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
          <div className={flexBetween}>
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
            <p className={cardTitle}>{member.first_name} {member.last_name}</p>
            <p className={mutedXsMt}>
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

