"use client";

import { errorBanner, flexBetween, ghostIconBtn, modalBackdrop } from "@/lib/ui-constants";
import type { Dispatch, SetStateAction } from "react";
export const RECORD_TYPES = [
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

export interface MedicalRecord {
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

export interface DependantRow extends PatientRow {
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  dependant_relationship: string | null;
  user_id: string | null;
}

export interface PatientDetail extends PatientRow {
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

export const inputCls =
  "w-full rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2.5 text-sm outline-none transition-all duration-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/15";
export const REL_STYLES: Record<string, { grad: string; badge: string; bar: string }> = {
  spouse: { grad: "from-rose-500 to-pink-600", badge: "bg-rose-50 text-rose-700", bar: "bg-rose-500" },
  child: { grad: "from-sky-500 to-blue-600", badge: "bg-sky-50 text-sky-700", bar: "bg-sky-500" },
  parent: { grad: "from-emerald-500 to-teal-600", badge: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" },
  sibling: { grad: "from-violet-500 to-indigo-600", badge: "bg-violet-50 text-violet-700", bar: "bg-violet-500" },
  other: { grad: "from-amber-400 to-orange-500", badge: "bg-amber-50 text-amber-700", bar: "bg-amber-500" },
};

export const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

export const capitalize = (v: string) => {
  const t = v.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
};

export const GENDERS: string[] = ["Male", "Female", "Other"];
export const BLOOD_GROUPS: string[] = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const GENOTYPES: string[] = ["AA", "AS", "SS", "AC", "SC", "CC"];
export const MARITAL_STATUSES: string[] = ["Single", "Married", "Divorced", "Widowed", "Separated"];
export type PatientTab = "info" | "records" | "notes" | "reports";

export interface PatientView {
  patient: PatientRow;
  canDelete: boolean;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  detail: PatientDetail | null;
  setDetail: Dispatch<SetStateAction<PatientDetail | null>>;
  records: MedicalRecord[];
  setRecords: Dispatch<SetStateAction<MedicalRecord[]>>;
  loading: boolean;
  setLoading: Dispatch<SetStateAction<boolean>>;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  editMode: boolean;
  setEditMode: Dispatch<SetStateAction<boolean>>;
  editDependant: DependantRow | null;
  setEditDependant: Dispatch<SetStateAction<DependantRow | null>>;
  showAddDependant: boolean;
  setShowAddDependant: Dispatch<SetStateAction<boolean>>;
  depInfo: string | null;
  setDepInfo: Dispatch<SetStateAction<string | null>>;
  showAddRecord: boolean;
  setShowAddRecord: Dispatch<SetStateAction<boolean>>;
  tab: PatientTab;
  setTab: Dispatch<SetStateAction<PatientTab>>;
  showSchedule: boolean;
  setShowSchedule: Dispatch<SetStateAction<boolean>>;
  menuOpen: boolean;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
  doctors: { id: string; label: string }[];
  setDoctors: Dispatch<SetStateAction<{ id: string; label: string }[]>>;
  schedBusy: boolean;
  setSchedBusy: Dispatch<SetStateAction<boolean>>;
  schedError: string | null;
  setSchedError: Dispatch<SetStateAction<string | null>>;
  load: () => Promise<void>;
  loadRecords: () => Promise<void>;
  addRecord: (form: FormData) => Promise<void>;
  saveEdit: (form: FormData) => Promise<void>;
  toggleStatus: () => Promise<void>;
  removePatient: () => Promise<void>;
  removeQuick: () => Promise<void>;
  openSchedule: () => Promise<void>;
  scheduleAppointment: (form: FormData) => Promise<void>;
  transferPatient: () => Promise<void>;
  addDependant: (form: FormData) => Promise<void>;
  updateDependant: (id: string, form: FormData) => Promise<void>;
  provisionDependantLogin: (d: DependantRow, forceReset?: boolean) => Promise<void>;
  removeDependant: (id: string) => Promise<void>;
  provisionPrimaryLogin: (forceReset?: boolean) => Promise<void>;
}

export function Modal({
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

export function ErrorNote({ error }: { error: string }) {
  return (
    <p
      role="alert"
      className={errorBanner}
    >
      {error}
    </p>
  );
}

export function formatDateOnly(value: string): string {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function calculateAge(value: string): string {
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