"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, ClipboardList, Eye, FileText, KeyRound, MoreHorizontal, Pencil, Trash2, UserRound } from "lucide-react";
import DoctorNotesSection from "@/components/dashboard/doctor-notes-section";
import MedicalReportsSection from "@/components/dashboard/medical-reports-section";
import { CLINICIAN_ROLES } from "@/lib/auth";
import { emptyState, errorBanner, flexBetween, flexWrapGap2, ghostIconBtn, modalBackdrop } from "@/lib/ui-constants";
import { ErrorNote, Modal, inputCls, labelCls, type DependantRow, type MedicalRecord, type PatientDetail, type PatientRow, type PatientView } from "./patient-dialog-shared";
import { PatientInfoTab } from "./patient-info-tab";
import { PatientMedicalRecordTab } from "./patient-medical-record-tab";
export function PatientViewButton({
  patient,
  myRole,
}: {
  patient: PatientRow;
  myRole?: string;
}) {
  const canDelete = myRole === "hospital_admin" || myRole === "super_admin";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<PatientDetail | null>(null);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editDependant, setEditDependant] = useState<DependantRow | null>(null);
  const [showAddDependant, setShowAddDependant] = useState(false);
  const [depInfo, setDepInfo] = useState<string | null>(null);
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [tab, setTab] = useState<"info" | "records" | "notes" | "reports">("info");
  const [showSchedule, setShowSchedule] = useState(false);
  const [doctors, setDoctors] = useState<{ id: string; label: string }[]>([]);
  const [schedBusy, setSchedBusy] = useState(false);
  const [schedError, setSchedError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-patient-menu]")) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${patient.id}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load patient");
      setDetail(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load patient");
    } finally {
      setLoading(false);
    }
  }, [patient.id]);

  const loadRecords = useCallback(async () => {
    try {
      const res = await fetch(`/api/medical-records?patient_id=${patient.id}&pageSize=50`, { cache: "no-store" });
      const body = await res.json();
      if (res.ok) setRecords(body.data ?? []);
    } catch {
      /* non-critical */
    }
  }, [patient.id]);

  useEffect(() => {
    if (open) {
      load();
      loadRecords();
    }
  }, [open, load, loadRecords]);

  async function addRecord(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/medical-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: patient.id,
          recordType: form.get("recordType"),
          title: form.get("title"),
          content: (form.get("content") as string) || undefined,
          isConfidential: form.get("isConfidential") === "on",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to add record");
      setShowAddRecord(false);
      await loadRecords();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add record");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${patient.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date_of_birth: form.get("dateOfBirth") || undefined,
          phone: form.get("phone") || undefined,
          email: form.get("email") || undefined,
          address: form.get("address") || undefined,
          city: form.get("city") || undefined,
          state: form.get("state") || undefined,
          blood_group: form.get("bloodGroup") || undefined,
          genotype: form.get("genotype") || undefined,
          allergies: form.get("allergies") || undefined,
          height_cm: form.get("heightCm") ? Number(form.get("heightCm")) : null,
          weight_kg: form.get("weightKg") ? Number(form.get("weightKg")) : null,
          emergency_contact_name: form.get("emergencyName") || undefined,
          emergency_contact_phone: form.get("emergencyPhone") || undefined,
          marital_status: form.get("maritalStatus") || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save changes");
      setEditMode(false);
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save changes");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    if (!detail) return;
    const next = detail.status === "active" ? "inactive" : "active";
    if (!confirm(`${next === "inactive" ? "Deactivate" : "Activate"} ${detail.last_name}, ${detail.first_name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${patient.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update status");
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setBusy(false);
    }
  }

  async function removePatient() {
    if (!detail) return;
    const dependantNote = detail.dependants.length ? `\n\nIt also permanently deletes ${detail.dependants.length} dependant record(s) on this account.` : "";
    if (!confirm(`Permanently delete ${detail.last_name}, ${detail.first_name}? This removes the patient and ALL of their records (billing, appointments, clinical notes, medical reports, chats) from the system. This cannot be undone.${dependantNote}${detail.user_id ? "\n\nAny portal login will also be deleted." : ""}`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${patient.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete patient");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete patient");
    } finally {
      setBusy(false);
    }
  }

  async function removeQuick() {
    if (
      !confirm(
        `Permanently delete ${patient.last_name}, ${patient.first_name}? This removes the patient and ALL of their records (billing, appointments, clinical notes, medical reports, chats) from the system. This cannot be undone.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${patient.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete patient");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete patient");
    } finally {
      setBusy(false);
    }
  }

  async function openSchedule() {
    setShowSchedule(true);
    setSchedError(null);
    try {
      const res = await fetch("/api/staff?pageSize=100", { cache: "no-store" });
      const body = await res.json();
      setDoctors(
        (body.data ?? [])
          .filter((s: { users?: { role?: string } }) => !!s.users?.role && CLINICIAN_ROLES.includes(s.users.role as (typeof CLINICIAN_ROLES)[number]))
          .map((s: { id: string; users?: { id?: string; full_name?: string } }) => ({
            id: s.users?.id ?? s.id,
            label: s.users?.full_name ?? "Doctor",
          }))
      );
    } catch {
      /* doctor options are non-critical */
    }
  }

  async function scheduleAppointment(form: FormData) {
    setSchedBusy(true);
    setSchedError(null);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: patient.id,
          doctorId: (form.get("doctorId") as string) || undefined,
          scheduledDate: form.get("scheduledDate"),
          startTime: form.get("startTime"),
          type: form.get("type"),
          reason: (form.get("reason") as string) || undefined,
          notes: (form.get("notes") as string) || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to book appointment");
      setShowSchedule(false);
      router.refresh();
    } catch (e) {
      setSchedError(e instanceof Error ? e.message : "Failed to book appointment");
    } finally {
      setSchedBusy(false);
    }
  }

  async function transferPatient() {
    if (!detail) return;
    if (!confirm(`Transfer ${detail.last_name}, ${detail.first_name} to another hospital? Their record is kept and marked as "transferred", and their portal login is disabled.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${patient.id}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to transfer patient");
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to transfer patient");
    } finally {
      setBusy(false);
    }
  }

  async function addDependant(form: FormData) {
    setBusy(true);
    setError(null);
    setDepInfo(null);
    try {
      const res = await fetch("/api/dependants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryPatientId: patient.id,
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          gender: form.get("gender") || undefined,
          dateOfBirth: form.get("dateOfBirth") || undefined,
          phone: form.get("phone") || undefined,
          email: form.get("email") || undefined,
          relationship: form.get("relationship"),
          address: form.get("address") || undefined,
          city: form.get("city") || undefined,
          state: form.get("state") || undefined,
          emergencyContactName: form.get("emergencyContactName") || undefined,
          emergencyContactPhone: form.get("emergencyContactPhone") || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to add dependant");
      const added = body.data as { tempPassword?: string } | null;
      if (added?.tempPassword) {
        setDepInfo(
          `A portal login was created automatically from this dependant's email. Share these credentials with them: temporary password ${added.tempPassword}`
        );
      }
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add dependant");
    } finally {
      setBusy(false);
    }
  }

  async function updateDependant(id: string, form: FormData) {
    setBusy(true);
    setError(null);
    setDepInfo(null);
    try {
      const res = await fetch(`/api/dependants/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: form.get("firstName"),
          last_name: form.get("lastName"),
          gender: form.get("gender") || null,
          date_of_birth: form.get("dateOfBirth") || null,
          phone: form.get("phone") || null,
          email: form.get("email") || null,
          dependant_relationship: form.get("relationship"),
          address: form.get("address") || null,
          city: form.get("city") || null,
          state: form.get("state") || null,
          emergency_contact_name: form.get("emergencyContactName") || null,
          emergency_contact_phone: form.get("emergencyContactPhone") || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update dependant");
      setEditDependant(null);
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update dependant");
    } finally {
      setBusy(false);
    }
  }

  async function provisionDependantLogin(d: DependantRow, forceReset = false) {
    const who = `${d.first_name} ${d.last_name}`;
    if (!forceReset && !confirm(`Create a portal login for ${who}? A temporary password will be generated — you'll see it once, so copy it and share it with them.`)) return;
    if (forceReset && !confirm(`Reset the portal password for ${who}? A new temporary password will be generated — you'll see it once, so copy it and share it with them; the old one stops working immediately.`)) return;
    setBusy(true);
    setError(null);
    setDepInfo(null);
    try {
      const res = await fetch("/api/dependants/provision-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientIds: [d.id], forceReset }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create portal login");
      const p = body.data?.provisioned?.[0] as { firstName?: string; lastName?: string; email?: string; tempPassword?: string } | undefined;
      if (p?.tempPassword) {
        setDepInfo(forceReset
          ? `Portal password reset for ${p.firstName ?? ""} ${p.lastName ?? ""}. Share these credentials: email ${p.email}, temporary password ${p.tempPassword}`
          : `Portal login created for ${p.firstName ?? ""} ${p.lastName ?? ""}. Share these credentials: email ${p.email}, temporary password ${p.tempPassword}`);
      } else {
        setDepInfo(`No login created — ${body.data?.skipped?.[0]?.reason ?? "see the message"}.`);
      }
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create portal login");
    } finally {
      setBusy(false);
    }
  }

  async function removeDependant(id: string) {
    if (!confirm("Remove this dependant? This deactivates their portal login.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dependants/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to remove dependant");
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove dependant");
    } finally {
      setBusy(false);
    }
  }

  async function provisionPrimaryLogin(forceReset = false) {
    if (!detail) return;
    const who = `${detail.first_name} ${detail.last_name}`;
    if (!forceReset && !confirm(`Create a portal login for ${who}? A temporary password will be generated — you'll see it once, so copy it and share it with them.`)) return;
    if (forceReset && !confirm(`Reset the portal password for ${who}? A new temporary password will be generated — you'll see it once, so copy it and share it with them; the old one stops working immediately.`)) return;
    setBusy(true);
    setError(null);
    setDepInfo(null);
    try {
      const res = await fetch(`/api/patients/${patient.id}/provision-portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceReset }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create portal login");
      const p = body.data?.provisioned?.[0] as { firstName?: string; lastName?: string; email?: string; tempPassword?: string } | undefined;
      if (p?.tempPassword) {
        setDepInfo(forceReset
          ? `Portal password reset for ${p.firstName ?? ""} ${p.lastName ?? ""}. Share these credentials: email ${p.email}, temporary password ${p.tempPassword}`
          : `Portal login created for ${p.firstName ?? ""} ${p.lastName ?? ""}. Share these credentials: email ${p.email}, temporary password ${p.tempPassword}`);
      } else {
        setDepInfo(`No login created — ${body.data?.skipped?.[0]?.reason ?? "see the message"}.`);
      }
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create portal login");
    } finally {
      setBusy(false);
    }
  }
  const view: PatientView = {
    patient,
    canDelete,
    open,
    setOpen,
    detail,
    setDetail,
    records,
    setRecords,
    loading,
    setLoading,
    busy,
    setBusy,
    error,
    setError,
    editMode,
    setEditMode,
    editDependant,
    setEditDependant,
    showAddDependant,
    setShowAddDependant,
    depInfo,
    setDepInfo,
    showAddRecord,
    setShowAddRecord,
    tab,
    setTab,
    showSchedule,
    setShowSchedule,
    menuOpen,
    setMenuOpen,
    doctors,
    setDoctors,
    schedBusy,
    setSchedBusy,
    schedError,
    setSchedError,
    load,
    loadRecords,
    addRecord,
    saveEdit,
    toggleStatus,
    removePatient,
    removeQuick,
    openSchedule,
    scheduleAppointment,
    transferPatient,
    addDependant,
    updateDependant,
    provisionDependantLogin,
    removeDependant,
    provisionPrimaryLogin,
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setEditMode(false);
            setOpen(true);
          }}
          className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-primary)] transition-colors duration-200 hover:border-[var(--color-primary)]"
        >
          <Eye size={13} aria-hidden="true" /> View
        </button>
        <div className="relative shrink-0" data-patient-menu>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={busy}
            aria-label={`More actions for ${patient.last_name}, ${patient.first_name}`}
            aria-expanded={menuOpen}
            className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          >
            <MoreHorizontal size={16} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white py-1 shadow-[var(--shadow-lg)]">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setEditMode(true);
                  setOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--color-foreground)] transition-colors duration-150 hover:bg-[var(--color-muted)]"
              >
                <Pencil size={13} aria-hidden="true" /> Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  openSchedule();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--color-foreground)] transition-colors duration-150 hover:bg-[var(--color-muted)]"
              >
                <CalendarPlus size={13} aria-hidden="true" /> Schedule
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    removeQuick();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-600 transition-colors duration-150 hover:bg-red-50"
                >
                  <Trash2 size={13} aria-hidden="true" /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {open && (
        <Modal
          title={`${detail ? `${detail.last_name}, ${detail.first_name}` : "Patient"} — ${patient.patient_number}`}
          onClose={() => setOpen(false)}
          wide
        >
          {loading ? (
            <p className={emptyState}>Loading patient…</p>
          ) : detail ? (
            <div className="space-y-6">
              <div className={flexWrapGap2}>
                <span className="rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-primary-dark)]">
                  {detail.status}
                </span>
                <span className="rounded-full bg-[var(--color-muted)] px-3 py-1 text-xs font-medium capitalize text-[var(--color-muted-fg)]">
                  {detail.gender ?? "No gender"}
                </span>
                {!editMode && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditMode(true)}
                      className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium transition-colors duration-200 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                    >
                      Edit details
                    </button>
                    <button
                      type="button"
                      onClick={toggleStatus}
                      disabled={busy}
                      className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium transition-colors duration-200 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                    >
                      {detail.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      type="button"
                      onClick={transferPatient}
                      disabled={busy || detail.status === "transferred"}
                      className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] transition-colors duration-200 hover:border-[var(--color-primary)]"
                    >
                      {detail.status === "transferred" ? "Transferred" : "Transfer"}
                    </button>
                    {canDelete && detail.status === "active" && (
                      <button
                        type="button"
                        onClick={() => provisionPrimaryLogin(!!detail.user_id)}
                        disabled={busy}
                        className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors duration-200 hover:border-amber-300 hover:bg-amber-50"
                      >
                        <KeyRound size={13} aria-hidden="true" /> {detail.user_id ? "Reset password" : "Create portal login"}
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={removePatient}
                        disabled={busy}
                        className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-red-600 transition-colors duration-200 hover:border-red-300 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    )}
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 border-b border-[var(--color-border)] pb-3">
                {(
                  [
                    ["info", "Patient Info", UserRound],
                    ["records", "Medical Records", ClipboardList],
                    ["notes", "Clinical Notes", FileText],
                    ["reports", "Medical Reports", FileText],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                      tab === key
                        ? "bg-[var(--color-primary)] text-white"
                        : "text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]/60 hover:text-[var(--color-foreground)]"
                    }`}
                  >
                    <Icon size={13} aria-hidden="true" /> {label}
                  </button>
                ))}
              </div>
              {tab === "info" && <PatientInfoTab view={view} />}
              {tab === "records" && <PatientMedicalRecordTab view={view} />}
              {tab === "notes" && (
                <DoctorNotesSection patientId={patient.id} />
              )}

              {tab === "reports" && (
                <MedicalReportsSection
                  patientId={patient.id}
                  patientName={detail ? `${detail.first_name} ${detail.last_name}` : "Patient"}
                />
              )}
            </div>
          ) : (
            <ErrorNote error={error ?? "Patient not found"} />
          )}
        </Modal>
      )}
      {showSchedule && (
        <div
          className={modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`Schedule appointment for ${patient.last_name}, ${patient.first_name}`}
        >
          <div className="my-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className={flexBetween}>
              <h2 className="text-lg font-bold">
                New Appointment — {patient.last_name}, {patient.first_name}
              </h2>
              <button
                type="button"
                onClick={() => setShowSchedule(false)}
                className={ghostIconBtn}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                scheduleAppointment(new FormData(e.currentTarget));
              }}
            >
              <div>
                <label className={labelCls} htmlFor="sch-doctor">Doctor (optional)</label>
                <select id="sch-doctor" name="doctorId" className={inputCls}>
                  <option value="">No doctor assigned</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} htmlFor="sch-date">Date</label>
                  <input
                    id="sch-date"
                    name="scheduledDate"
                    type="date"
                    required
                    min={new Date().toISOString().slice(0, 10)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="sch-start">Start time</label>
                  <input id="sch-start" name="startTime" type="time" required className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="sch-type">Type</label>
                <select id="sch-type" name="type" className={inputCls} defaultValue="in_person">
                  <option value="in_person">In-person visit</option>
                  <option value="telemedicine">Telemedicine</option>
                  <option value="home_visit">Home visit</option>
                  <option value="follow_up">Follow-up</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="sch-reason">Reason</label>
                <input id="sch-reason" name="reason" className={inputCls} placeholder="Reason for visit" />
              </div>
              <div>
                <label className={labelCls} htmlFor="sch-notes">Notes (optional)</label>
                <textarea id="sch-notes" name="notes" rows={2} className={inputCls} />
              </div>
              {schedError && (
                <p
                  role="alert"
                  className={errorBanner}
                >
                  {schedError}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowSchedule(false)}
                  className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={schedBusy}
                  className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
                >
                  <CalendarPlus size={15} aria-hidden="true" />
                  {schedBusy ? "Booking…" : "Book appointment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
