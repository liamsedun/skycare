"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, ClipboardList, Eye, EyeOff, FileText, HeartPulse, KeyRound, Mail, MapPin, MoreHorizontal, Pencil, Phone, PhoneCall, Plus, ShieldAlert, Trash2, UserRound, Users } from "lucide-react";
import DoctorNotesSection from "@/components/dashboard/doctor-notes-section";
import MedicalReportsSection from "@/components/dashboard/medical-reports-section";
import { Combobox } from "@/components/ui/combobox";
import { CLINICIAN_ROLES } from "@/lib/auth";
import { mutedFg, errorBanner, flexBetween, mutedXsMt, flexWrapGap2, fgMedium, mutedXsMt1, ghostIconBtn, emptyState, modalBackdrop } from "@/lib/ui-constants";

const RECORD_TYPES = [
  "diagnosis",
  "lab_result",
  "prescription",
  "surgery_report",
  "vaccination",
  "imaging",
  "progress_note",
  "admission_summary",
  "discharge_summary",
] as const;

interface MedicalRecord {
  id: string;
  record_type: string;
  title: string;
  content: string | null;
  is_confidential: boolean;
  created_at: string;
  users: { full_name: string } | null;
}

export interface PatientRow {
  id: string;
  patient_number: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  date_of_birth: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  status: string;
  created_at: string;
}

interface DependantRow extends PatientRow {
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  dependant_relationship: string | null;
  user_id: string | null;
}

interface PatientDetail extends PatientRow {
  address: string | null;
  blood_group: string | null;
  genotype: string | null;
  allergies: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  marital_status: string | null;
  user_id: string | null;
  dependants: DependantRow[];
}

const inputCls =
  "w-full rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2.5 text-sm outline-none transition-all duration-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/15";
const REL_STYLES: Record<string, { grad: string; badge: string; bar: string }> = {
  spouse: { grad: "from-rose-500 to-pink-600", badge: "bg-rose-50 text-rose-700", bar: "bg-rose-500" },
  child: { grad: "from-sky-500 to-blue-600", badge: "bg-sky-50 text-sky-700", bar: "bg-sky-500" },
  parent: { grad: "from-emerald-500 to-teal-600", badge: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" },
  sibling: { grad: "from-violet-500 to-indigo-600", badge: "bg-violet-50 text-violet-700", bar: "bg-violet-500" },
  other: { grad: "from-amber-400 to-orange-500", badge: "bg-amber-50 text-amber-700", bar: "bg-amber-500" },
};

const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

const capitalize = (v: string) => {
  const t = v.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
};

const GENDERS: string[] = ["Male", "Female", "Other"];
const BLOOD_GROUPS: string[] = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENOTYPES: string[] = ["AA", "AS", "SS", "AC", "SC", "CC"];
const MARITAL_STATUSES: string[] = ["Single", "Married", "Divorced", "Widowed", "Separated"];

export function AddPatientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portalLogin, setPortalLogin] = useState(false);
  const [portalEmail, setPortalEmail] = useState("");
  const [portalPassword, setPortalPassword] = useState("");
  const [showPortalPassword, setShowPortalPassword] = useState(false);
  const [email, setEmail] = useState("");

  async function handleSubmit(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          otherNames: form.get("otherNames") || undefined,
          gender: form.get("gender") || undefined,
          dateOfBirth: form.get("dateOfBirth") || undefined,
          phone: form.get("phone") || undefined,
          email: email || undefined,
          address: form.get("address") || undefined,
          city: form.get("city") || undefined,
          state: form.get("state") || undefined,
          bloodGroup: form.get("bloodGroup") || undefined,
          genotype: form.get("genotype") || undefined,
          allergies: form.get("allergies") || undefined,
          heightCm: form.get("heightCm") ? Number(form.get("heightCm")) : undefined,
          weightKg: form.get("weightKg") ? Number(form.get("weightKg")) : undefined,
          emergencyContactName: form.get("emergencyName") || undefined,
          emergencyContactPhone: form.get("emergencyPhone") || undefined,
          maritalStatus: form.get("maritalStatus") || undefined,
          portalEmail: portalLogin ? portalEmail : undefined,
          portalPassword: portalLogin ? portalPassword : undefined,
          mustChangePassword: portalLogin ? form.get("mustChangePassword") === "on" : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to register patient");
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to register patient");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <Modal
      title="Register Patient"
      onClose={onClose}
      error={error}
      busy={busy}
      submitLabel={busy ? "Registering…" : "Register Patient"}
      onSubmit={handleSubmit}
      wide
    >
          <div className="space-y-5">
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/25 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]">
                  <UserRound size={13} aria-hidden="true" />
                </span>
                Personal details
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="p-first">First Name</label>
                  <input id="p-first" name="firstName" required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-last">Last Name</label>
                  <input id="p-last" name="lastName" required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-other">Other Names</label>
                  <input id="p-other" name="otherNames" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-gender">Gender</label>
                  <Combobox
                    id="p-gender"
                    name="gender"
                    options={GENDERS}
                    normalize={capitalize}
                    placeholder="Pick or Type (e.g. Male)"
                  />
                  <p className={mutedXsMt1}>Pick or Type an option, or add one not listed.</p>
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-dob">Date of Birth</label>
                  <input id="p-dob" name="dateOfBirth" type="date" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-phone">Phone</label>
                  <input id="p-phone" name="phone" type="tel" className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls} htmlFor="p-email">Email</label>
                  <input
                    id="p-email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (!portalEmail) setPortalEmail(e.target.value);
                    }}
                    className={inputCls}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls} htmlFor="p-address">Address</label>
                  <input id="p-address" name="address" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-city">City</label>
                  <input id="p-city" name="city" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-state">State</label>
                  <input id="p-state" name="state" className={inputCls} />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/25 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]">
                  <HeartPulse size={13} aria-hidden="true" />
                </span>
                Clinical Info
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className={labelCls} htmlFor="p-blood">Blood Group</label>
                  <Combobox
                    id="p-blood"
                    name="bloodGroup"
                    options={BLOOD_GROUPS}
                    normalize={(v) => v.trim().toUpperCase().replace(/0/g, "O")}
                    placeholder="Pick or Type (e.g. O+)"
                  />
                  <p className={mutedXsMt1}>Pick an option or add one not listed.</p>
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-genotype">Genotype</label>
                  <Combobox
                    id="p-genotype"
                    name="genotype"
                    options={GENOTYPES}
                    normalize={(v) => v.trim().toUpperCase()}
                    placeholder="Pick or Type (e.g. AA)"
                  />
                  <p className={mutedXsMt1}>Pick an option or add one not listed.</p>
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-marital">Marital Status</label>
                  <Combobox
                    id="p-marital"
                    name="maritalStatus"
                    options={MARITAL_STATUSES}
                    normalize={capitalize}
                    placeholder="Pick or Type (e.g. Single)"
                  />
                  <p className={mutedXsMt1}>
                    Pick or Type — e.g. Single, Married, Divorced, Widowed, Separated.
                  </p>
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-height">Height (cm)</label>
                  <input id="p-height" name="heightCm" type="number" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-weight">Weight (kg)</label>
                  <input id="p-weight" name="weightKg" type="number" className={inputCls} />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/25 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]">
                  <PhoneCall size={13} aria-hidden="true" />
                </span>
                Emergency Contact
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="p-ec-name">Emergency Contact</label>
                  <input id="p-ec-name" name="emergencyName" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-ec-phone">Emergency Phone</label>
                  <input id="p-ec-phone" name="emergencyPhone" type="tel" className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls} htmlFor="p-allergies">Allergies</label>
                  <input id="p-allergies" name="allergies" placeholder="e.g. Penicillin" className={inputCls} />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/25 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]">
                  <KeyRound size={13} aria-hidden="true" />
                </span>
                Patient portal login
              </h3>
              <p className="mb-3 text-xs text-[var(--color-muted-fg)]">
                Give the patient a temporary welcome password they can use to sign in at /login. They&apos;ll be
                prompted to set their own password after the first login.
              </p>
              <label className="mb-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={portalLogin}
                  onChange={(e) => setPortalLogin(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                />
                Give this patient portal login (sign in at /login)
              </label>
              {portalLogin && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelCls} htmlFor="p-portal-email">Portal login email</label>
                    <input
                      id="p-portal-email"
                      type="email"
                      value={portalEmail}
                      onChange={(e) => setPortalEmail(e.target.value)}
                      placeholder="Defaults to the patient email above"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="p-portal-pass">Temporary Password (welcome password)</label>
                    <div className="relative">
                      <input
                        id="p-portal-pass"
                        type={showPortalPassword ? "text" : "password"}
                        value={portalPassword}
                        onChange={(e) => setPortalPassword(e.target.value)}
                        placeholder="8+ characters"
                        className={inputCls}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPortalPassword((v) => !v)}
                        className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-slate-100"
                        aria-label={showPortalPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPortalPassword}
                      >
                        {showPortalPassword ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                      </button>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input
                      type="checkbox"
                      name="mustChangePassword"
                      defaultChecked
                      className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                    />
                    <span>Require password change at first login</span>
                  </label>
                </div>
              )}
            </section>
          </div>
        </Modal>
  );
}

export function AddPatientButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]"
      >
        <Plus size={16} aria-hidden="true" /> Register Patient
      </button>
      <AddPatientModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

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

              {tab === "info" && (
                <>
                  {editMode ? (
                <form
                  className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-4 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveEdit(new FormData(e.currentTarget));
                  }}
                >
{error && <ErrorNote error={error} />}
                {depInfo && (
                  <p role="status" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                    {depInfo}
                  </p>
                )}
                  <div>
                    <label className={labelCls} htmlFor="e-dob">Date of Birth</label>
                    <input id="e-dob" name="dateOfBirth" type="date" defaultValue={detail.date_of_birth?.slice(0, 10) ?? ""} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-phone">Phone</label>
                    <input id="e-phone" name="phone" defaultValue={detail.phone ?? ""} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-email">Email</label>
                    <input id="e-email" name="email" type="email" defaultValue={detail.email ?? ""} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls} htmlFor="e-address">Address</label>
                    <input id="e-address" name="address" defaultValue={detail.address ?? ""} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-city">City</label>
                    <input id="e-city" name="city" defaultValue={detail.city ?? ""} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-state">State</label>
                    <input id="e-state" name="state" defaultValue={detail.state ?? ""} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-blood">Blood Group</label>
                    <Combobox
                      id="e-blood"
                      name="bloodGroup"
                      options={BLOOD_GROUPS}
                      normalize={(v) => v.trim().toUpperCase().replace(/0/g, "O")}
                      defaultValue={detail.blood_group ?? ""}
                      placeholder="Pick or Type"
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-genotype">Genotype</label>
                    <Combobox
                      id="e-genotype"
                      name="genotype"
                      options={GENOTYPES}
                      normalize={(v) => v.trim().toUpperCase()}
                      defaultValue={detail.genotype ?? ""}
                      placeholder="Pick or Type"
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-marital">Marital Status</label>
                    <Combobox
                      id="e-marital"
                      name="maritalStatus"
                      options={MARITAL_STATUSES}
                      normalize={capitalize}
                      defaultValue={detail.marital_status ? capitalize(detail.marital_status) : ""}
                      placeholder="Pick or Type"
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-height">Height (cm)</label>
                    <input id="e-height" name="heightCm" type="number" defaultValue={detail.height_cm ?? ""} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-weight">Weight (kg)</label>
                    <input id="e-weight" name="weightKg" type="number" defaultValue={detail.weight_kg ?? ""} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-ec-name">Emergency Contact</label>
                    <input id="e-ec-name" name="emergencyName" defaultValue={detail.emergency_contact_name ?? ""} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-ec-phone">Emergency Phone</label>
                    <input id="e-ec-phone" name="emergencyPhone" defaultValue={detail.emergency_contact_phone ?? ""} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls} htmlFor="e-allergies">Allergies</label>
                    <input id="e-allergies" name="allergies" defaultValue={detail.allergies ?? ""} className={inputCls} />
                  </div>
                  <div className="flex gap-3 sm:col-span-2">
                    <button
                      type="button"
                      onClick={() => setEditMode(false)}
                      className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2 text-sm font-medium hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
                    >
                      {busy ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-4 shadow-[var(--shadow-sm)]">
                {depInfo && (
                  <p role="status" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                    {depInfo}
                  </p>
                )}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3">
                  {[
                    ["Date of Birth", detail.date_of_birth ? formatDateOnly(detail.date_of_birth) : "—"],
                    ["Age", detail.date_of_birth ? calculateAge(detail.date_of_birth) : "—"],
                    ["Blood Group", detail.blood_group],
                    ["Genotype", detail.genotype],
                    ["Height", detail.height_cm ? `${detail.height_cm} cm` : "—"],
                    ["Weight", detail.weight_kg ? `${detail.weight_kg} kg` : "—"],
                    ["Marital Status", detail.marital_status ? capitalize(detail.marital_status) : "—"],
                    ["Emergency Contact", detail.emergency_contact_name],
                    ["Allergies", detail.allergies],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <dt className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">{k}</dt>
                      <dd className="mt-0.5 font-medium text-[var(--color-foreground)]">{v ?? "—"}</dd>
                    </div>
                  ))}
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">Address</dt>
                    <dd className="mt-0.5 flex items-start gap-1.5 font-medium text-[var(--color-foreground)]">
                      <MapPin size={12} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-muted-fg)]" />
                      {[detail.address, detail.city, detail.state].filter(Boolean).join(", ") || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">Phone</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-[var(--color-foreground)]">
                      <Phone size={12} aria-hidden="true" className="shrink-0 text-[var(--color-muted-fg)]" />
                      {detail.phone ? (
                        <a className="focus-ring font-semibold text-blue-600 transition-colors duration-200 hover:text-blue-700 hover:underline" href={`tel:${detail.phone}`}>{detail.phone}</a>
                      ) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">Email</dt>
                    <dd className="mt-0.5 flex min-w-0 items-center gap-1.5 font-medium text-[var(--color-foreground)]">
                      <Mail size={12} aria-hidden="true" className="shrink-0 text-[var(--color-muted-fg)]" />
                      {detail.email ? (
                        <a className="focus-ring truncate font-semibold text-blue-600 transition-colors duration-200 hover:text-blue-700 hover:underline" href={`mailto:${detail.email}`}>{detail.email}</a>
                      ) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">Emergency Phone</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-[var(--color-foreground)]">
                      <Phone size={12} aria-hidden="true" className="shrink-0 text-[var(--color-muted-fg)]" />
                      {detail.emergency_contact_phone ? (
                        <a className="focus-ring font-semibold text-blue-600 transition-colors duration-200 hover:text-blue-700 hover:underline" href={`tel:${detail.emergency_contact_phone}`}>{detail.emergency_contact_phone}</a>
                      ) : "—"}
                    </dd>
                  </div>
                </dl>
                </div>
              )}

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]">
                    <Users size={15} aria-hidden="true" /> Dependants
                    <span className="text-xs font-normal text-[var(--color-muted-fg)]">
                      {detail.dependants.length} family {detail.dependants.length === 1 ? "member" : "members"}
                    </span>
                  </h3>
                  {!editDependant && (
                    <button
                      type="button"
                      onClick={() => setShowAddDependant((v) => !v)}
                      className="focus-ring rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)]"
                    >
                      {showAddDependant ? "Close form" : "+ Add Dependant"}
                    </button>
                  )}
                </div>
                {error && <ErrorNote error={error} />}

                {detail.dependants.length > 0 && (
                  <div className="mb-4 space-y-3">
                    {detail.dependants.map((d) =>
                      editDependant?.id === d.id ? (
                        <form
                          key={d.id}
                          className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-primary-soft)]/40 p-4 sm:grid-cols-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            updateDependant(d.id, new FormData(e.currentTarget));
                          }}
                        >
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary-dark)] sm:col-span-2">
                            Edit Dependant — {d.first_name} {d.last_name}
                          </p>
                          <div>
                            <label className={labelCls} htmlFor={`dep-f-${d.id}`}>First Name</label>
                            <input id={`dep-f-${d.id}`} name="firstName" defaultValue={d.first_name} required className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-l-${d.id}`}>Last Name</label>
                            <input id={`dep-l-${d.id}`} name="lastName" defaultValue={d.last_name} required className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-g-${d.id}`}>Gender</label>
                            <Combobox
                              id={`dep-g-${d.id}`}
                              name="gender"
                              options={GENDERS}
                              normalize={capitalize}
                              defaultValue={d.gender ? capitalize(d.gender) : ""}
                              placeholder="Pick or Type"
                            />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-dob-${d.id}`}>Date of Birth</label>
                            <input id={`dep-dob-${d.id}`} name="dateOfBirth" type="date" defaultValue={d.date_of_birth?.slice(0, 10) ?? ""} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-ph-${d.id}`}>Phone</label>
                            <input id={`dep-ph-${d.id}`} name="phone" defaultValue={d.phone ?? ""} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-e-${d.id}`}>Email</label>
                            <input id={`dep-e-${d.id}`} name="email" type="email" defaultValue={d.email ?? ""} className={inputCls} placeholder="Used for their portal login" />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-r-${d.id}`}>Relationship</label>
                            <select id={`dep-r-${d.id}`} name="relationship" defaultValue={d.dependant_relationship ?? "other"} className={inputCls}>
                              <option value="spouse">Spouse</option>
                              <option value="child">Child</option>
                              <option value="parent">Parent</option>
                              <option value="sibling">Sibling</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className={labelCls} htmlFor={`dep-a-${d.id}`}>Address</label>
                            <input id={`dep-a-${d.id}`} name="address" defaultValue={d.address ?? ""} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-c-${d.id}`}>City</label>
                            <input id={`dep-c-${d.id}`} name="city" defaultValue={d.city ?? ""} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-s-${d.id}`}>State</label>
                            <input id={`dep-s-${d.id}`} name="state" defaultValue={d.state ?? ""} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-ec-${d.id}`}>Emergency Contact</label>
                            <input id={`dep-ec-${d.id}`} name="emergencyContactName" defaultValue={d.emergency_contact_name ?? ""} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-ep-${d.id}`}>Emergency Phone</label>
                            <input id={`dep-ep-${d.id}`} name="emergencyContactPhone" defaultValue={d.emergency_contact_phone ?? ""} className={inputCls} />
                          </div>
                          <div className="flex gap-3 sm:col-span-2">
                            <button
                              type="button"
                              onClick={() => setEditDependant(null)}
                              disabled={busy}
                              className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2 text-sm font-medium transition-colors duration-200 hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={busy}
                              className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
                            >
                              {busy ? "Saving…" : "Save Changes"}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div
                          key={d.id}
                          className="group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
                        >
                          {(() => {
                            const rel = d.dependant_relationship ?? "other";
                            const s = REL_STYLES[rel] ?? REL_STYLES.other;
                            return (
                              <>
                                <div className={`absolute inset-y-0 left-0 w-1 ${s.bar}`} />
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${s.grad} text-sm font-bold text-white shadow-md ring-2 ring-white`}>
                                      {`${d.first_name[0] ?? ""}${d.last_name[0] ?? ""}`.toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-bold text-[var(--color-foreground)]">
                                        {d.last_name}, {d.first_name}
                                      </p>
                                      <p className="font-mono text-[11px] text-[var(--color-muted-fg)]">{d.patient_number}</p>
                                    </div>
                                  </div>
                                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${s.badge}`}>
                                    {rel}
                                  </span>
                                </div>
                                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                                  <div>
                                    <dt className={mutedFg}>Gender</dt>
                                    <dd className="font-medium capitalize text-[var(--color-foreground)]">{d.gender ?? "—"}</dd>
                                  </div>
                                  <div>
                                    <dt className={mutedFg}>Date of Birth</dt>
                                    <dd className={fgMedium}>
                                      {d.date_of_birth ? formatDateOnly(d.date_of_birth) : "—"}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className={mutedFg}>Phone</dt>
                                    <dd className="flex items-center gap-1 font-medium text-[var(--color-foreground)]">
                                      <Phone size={12} aria-hidden="true" className="shrink-0 text-[var(--color-muted-fg)]" />
                                      {d.phone ? <a className="focus-ring font-semibold text-blue-600 hover:text-blue-700 hover:underline" href={`tel:${d.phone}`}>{d.phone}</a> : "—"}
                                    </dd>
                                  </div>
                                  <div className="col-span-2 sm:col-span-3">
                                    <dt className={mutedFg}>Address</dt>
                                    <dd className="flex items-start gap-1 font-medium text-[var(--color-foreground)]">
                                      <MapPin size={12} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-muted-fg)]" />
                                      {[d.address, d.city, d.state].filter(Boolean).join(", ") || "—"}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className={mutedFg}>Emergency Contact</dt>
                                    <dd className={fgMedium}>{d.emergency_contact_name ?? "—"}</dd>
                                  </div>
                                  <div>
                                    <dt className={mutedFg}>Emergency Phone</dt>
                                    <dd className="flex items-center gap-1 font-medium text-[var(--color-foreground)]">
                                      <Phone size={12} aria-hidden="true" className="shrink-0 text-[var(--color-muted-fg)]" />
                                      {d.emergency_contact_phone ? <a className="focus-ring font-semibold text-blue-600 hover:text-blue-700 hover:underline" href={`tel:${d.emergency_contact_phone}`}>{d.emergency_contact_phone}</a> : "—"}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className={mutedFg}>Portal Login</dt>
                                    <dd className={fgMedium}>{d.user_id ? "Active" : "None"}</dd>
                                  </div>
                                </dl>
                                <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-[var(--color-border)] pt-2.5">
                                  {!d.user_id ? (
                                    <button
                                      type="button"
                                      onClick={() => provisionDependantLogin(d, false)}
                                      disabled={busy}
                                      className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-amber-700 transition-colors duration-200 hover:border-amber-300 hover:bg-amber-50"
                                    >
                                      <KeyRound size={12} aria-hidden="true" /> Create portal login
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => provisionDependantLogin(d, true)}
                                      disabled={busy}
                                      className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-amber-700 transition-colors duration-200 hover:border-amber-300 hover:bg-amber-50"
                                    >
                                      <KeyRound size={12} aria-hidden="true" /> Reset password
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setEditDependant(d)}
                                    disabled={busy}
                                    className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-foreground)] transition-colors duration-200 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                                  >
                                    <Pencil size={12} aria-hidden="true" /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeDependant(d.id)}
                                    disabled={busy}
                                    className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors duration-200 hover:border-red-300 hover:bg-red-50"
                                  >
                                    <Trash2 size={12} aria-hidden="true" /> Remove
                                  </button>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )
                    )}
                  </div>
                )}

                {showAddDependant && detail.dependants.length < 5 && !editDependant && (
                  <form
                    className="grid grid-cols-1 gap-3 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4 sm:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addDependant(new FormData(e.currentTarget));
                    }}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)] sm:col-span-2">
                      Add Dependant (Family Member on This Account)
                    </p>
                    <div>
                      <label className={labelCls} htmlFor="d-first">First Name</label>
                      <input id="d-first" name="firstName" required className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-last">Last Name</label>
                      <input id="d-last" name="lastName" required className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-gender">Gender</label>
                      <Combobox
                        id="d-gender"
                        name="gender"
                        options={GENDERS}
                        normalize={capitalize}
                        placeholder="Pick or Type (e.g. Male)"
                      />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-dob">Date of Birth</label>
                      <input id="d-dob" name="dateOfBirth" type="date" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-phone">Phone</label>
                      <input id="d-phone" name="phone" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-email">Email</label>
                      <input id="d-email" name="email" type="email" className={inputCls} placeholder="Used to create their portal login automatically" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-rel">Relationship</label>
                      <select id="d-rel" name="relationship" required className={inputCls}>
                        <option value="">Select…</option>
                        <option value="spouse">Spouse</option>
                        <option value="child">Child</option>
                        <option value="parent">Parent</option>
                        <option value="sibling">Sibling</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls} htmlFor="d-address">Address</label>
                      <input id="d-address" name="address" defaultValue={detail.address ?? ""} className={inputCls} placeholder="Copied from main patient — editable" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-city">City</label>
                      <input id="d-city" name="city" defaultValue={detail.city ?? ""} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-state">State</label>
                      <input id="d-state" name="state" defaultValue={detail.state ?? ""} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-ec-name">Emergency Contact</label>
                      <input id="d-ec-name" name="emergencyContactName" defaultValue={detail.emergency_contact_name ?? ""} className={inputCls} placeholder="Copied from main patient — editable" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-ec-phone">Emergency Phone</label>
                      <input id="d-ec-phone" name="emergencyContactPhone" defaultValue={detail.emergency_contact_phone ?? ""} className={inputCls} placeholder="Copied from main patient — editable" />
                    </div>
                    <p className="text-xs text-[var(--color-muted-fg)] sm:col-span-2">
                      Address, City, State and emergency contacts are copied from the main patient record. You can adjust them here — they are editable later.
                    </p>
                    <button
                      type="submit"
                      disabled={busy}
                      className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60 sm:col-span-2"
                    >
                      <Plus size={15} aria-hidden="true" /> {busy ? "Adding…" : "Add Dependant"}
                    </button>
                  </form>
                )}
              </section>
              </>
              )}

              {tab === "records" && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]">
                    <ClipboardList size={15} aria-hidden="true" /> Medical Records
                    <span className="text-xs font-normal text-[var(--color-muted-fg)]">({records.length})</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowAddRecord((v) => !v)}
                    className="focus-ring rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)]"
                  >
                    {showAddRecord ? "Close form" : "+ Add Record"}
                  </button>
                </div>

                {showAddRecord && (
                  <form
                    className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4 sm:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addRecord(new FormData(e.currentTarget));
                    }}
                  >
                    <div>
                      <label className={labelCls} htmlFor="mr-type">Record type</label>
                      <select id="mr-type" name="recordType" required className={inputCls}>
                        {RECORD_TYPES.map((t) => (
                          <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="mr-title">Title</label>
                      <input id="mr-title" name="title" required className={inputCls} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls} htmlFor="mr-content">Content / notes</label>
                      <textarea id="mr-content" name="content" rows={3} className={inputCls} />
                    </div>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        name="isConfidential"
                        className="h-4 w-4 rounded border-[var(--color-border)] accent-red-500"
                      />
                      <span className="flex items-center gap-1 font-medium text-[var(--color-foreground)]">
                        <ShieldAlert size={14} aria-hidden="true" /> Confidential (hidden from patient portal)
                      </span>
                    </label>
                    <button
                      type="submit"
                      disabled={busy}
                      className="focus-ring rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60 sm:col-span-2"
                    >
                      {busy ? "Saving…" : "Save Record"}
                    </button>
                  </form>
                )}

                {records.length === 0 ? (
                  <p className="rounded-lg bg-[var(--color-muted)]/40 px-3 py-2 text-xs text-[var(--color-muted-fg)]">
                    No records yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {records.map((record) => (
                      <li
                        key={record.id}
                        className="rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={fgMedium}>{record.title}</p>
                            <p className={mutedXsMt}>
                              {record.record_type.replace(/_/g, " ")} ·{" "}
                              {new Date(record.created_at).toLocaleDateString()} ·{" "}
                              {record.users?.full_name ?? "—"}
                            </p>
                          </div>
                          {record.is_confidential && (
                            <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-700">
                              Confidential
                            </span>
                          )}
                        </div>
                        {record.content && (
                          <p className="mt-1.5 text-xs text-[var(--color-muted-fg)]">{record.content}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              )}

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

function Modal({
  title,
  onClose,
  error,
  busy,
  submitLabel,
  onSubmit,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  error?: string | null;
  busy?: boolean;
  submitLabel?: string;
  onSubmit?: (form: FormData) => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`my-4 w-full rounded-2xl bg-white p-6 shadow-2xl ${wide ? "max-w-2xl" : "max-w-md"}`}
      >
        <div className={flexBetween}>
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className={ghostIconBtn}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {error && !onSubmit && <div className="mt-3"><ErrorNote error={error} /></div>}
        {onSubmit ? (
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(new FormData(e.currentTarget));
            }}
          >
            {children}
            {error && <ErrorNote error={error} />}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="focus-ring flex flex-1 items-center justify-center rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
              >
                {submitLabel ?? "Save"}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-5">{children}</div>
        )}
      </div>
    </div>
  );
}

function ErrorNote({ error }: { error: string }) {
  return (
    <p
      role="alert"
      className={errorBanner}
    >
      {error}
    </p>
  );
}

function formatDateOnly(value: string): string {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function calculateAge(value: string): string {
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return "—";
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) years--;
  if (years < 0) return "—";
  if (years === 0) {
    const months = Math.max(0, Math.floor((today.getTime() - birth.getTime()) / (30.44 * 864e5)));
    return months < 12 ? `${months} mo` : `${years} yr`;
  }
  return `${years} yr`;
}
