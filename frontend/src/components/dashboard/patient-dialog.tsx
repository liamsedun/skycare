"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Eye, EyeOff, FileText, HeartPulse, KeyRound, PhoneCall, Plus, ShieldAlert, UserRound, Users } from "lucide-react";
import DoctorNotesSection from "@/components/dashboard/doctor-notes-section";
import MedicalReportsSection from "@/components/dashboard/medical-reports-section";
import { Combobox } from "@/components/ui/combobox";

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
  dependants: PatientRow[];
}

const inputCls =
  "w-full rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2.5 text-sm outline-none transition-all duration-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/15";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

const capitalize = (v: string) => {
  const t = v.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
};

const GENDERS: string[] = ["Male", "Female", "Other"];
const BLOOD_GROUPS: string[] = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENOTYPES: string[] = ["AA", "AS", "SS", "AC", "SC", "CC"];
const MARITAL_STATUSES: string[] = ["Single", "Married", "Divorced", "Widowed", "Separated"];

export function AddPatientButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to register patient");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]"
      >
        <Plus size={16} aria-hidden="true" /> Register Patient
      </button>

      {open && (
        <Modal
          title="Register Patient"
          onClose={() => setOpen(false)}
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
                  <p className="mt-1 text-xs text-[var(--color-muted-fg)]">Pick or Type an option, or add one not listed.</p>
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
                  <p className="mt-1 text-xs text-[var(--color-muted-fg)]">Pick an option or add one not listed.</p>
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
                  <p className="mt-1 text-xs text-[var(--color-muted-fg)]">Pick an option or add one not listed.</p>
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
                  <p className="mt-1 text-xs text-[var(--color-muted-fg)]">
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
      )}
    </>
  );
}

export function PatientViewButton({ patient }: { patient: PatientRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<PatientDetail | null>(null);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [tab, setTab] = useState<"info" | "records" | "notes" | "reports">("info");

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
          relationship: form.get("relationship"),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to add dependant");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add dependant");
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove dependant");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-primary)] transition-colors duration-200 hover:border-[var(--color-primary)]"
      >
        <Eye size={13} aria-hidden="true" /> View
      </button>

      {open && (
        <Modal
          title={`${detail ? `${detail.last_name}, ${detail.first_name}` : "Patient"} — ${patient.patient_number}`}
          onClose={() => setOpen(false)}
          wide
        >
          {loading ? (
            <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading patient…</p>
          ) : detail ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
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
                    <button
                      type="button"
                      onClick={removePatient}
                      disabled={busy}
                      className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-red-600 transition-colors duration-200 hover:border-red-300 hover:bg-red-50"
                    >
                      Remove
                    </button>
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
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                  {[
                    ["DOB", detail.date_of_birth ? formatDateOnly(detail.date_of_birth) : "—"],
                    ["Phone", detail.phone],
                    ["Email", detail.email],
                    ["Address", [detail.address, detail.city, detail.state].filter(Boolean).join(", ") || "—"],
                    ["Blood Group", detail.blood_group],
                    ["Genotype", detail.genotype],
                    ["Height", detail.height_cm ? `${detail.height_cm} cm` : "—"],
                    ["Weight", detail.weight_kg ? `${detail.weight_kg} kg` : "—"],
                    ["Marital Status", detail.marital_status ? capitalize(detail.marital_status) : "—"],
                    ["Emergency Contact", detail.emergency_contact_name],
                    ["Emergency Phone", detail.emergency_contact_phone],
                    ["Allergies", detail.allergies],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">{k}</dt>
                      <dd className="mt-0.5 font-medium text-[var(--color-foreground)]">{v ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <section>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]">
                  <Users size={15} aria-hidden="true" /> Dependants
                  <span className="text-xs font-normal text-[var(--color-muted-fg)]">
                    ({detail.dependants.length}/5)
                  </span>
                </h3>
                {error && <ErrorNote error={error} />}
                {detail.dependants.length > 0 && (
                  <ul className="mb-4 space-y-2">
                    {detail.dependants.map((d) => (
                      <li
                        key={d.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--color-foreground)]">
                            {d.last_name}, {d.first_name}
                          </p>
                          <p className="font-mono text-xs text-[var(--color-muted-fg)]">{d.patient_number}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDependant(d.id)}
                          disabled={busy}
                          className="focus-ring shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition-colors duration-200 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {detail.dependants.length < 5 && (
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
                            <p className="font-medium text-[var(--color-foreground)]">{record.title}</p>
                            <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100"
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
      className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]"
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
