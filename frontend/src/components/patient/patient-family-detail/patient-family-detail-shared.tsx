export const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
export const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

export const recordTypeLabels: Record<string, string> = {
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

export type TabKey = "biodata" | "records" | "bills" | "appointments";

export interface MedicalRecord {
  id: string;
  record_type: string;
  title: string | null;
  content: string | null;
  created_at: string;
  users: { full_name: string; role: string } | null;
}

export interface DoctorNote {
  id: string;
  visit_date: string | null;
  clinical_findings: string | null;
  treatment_recommendations: string | null;
  diagnosis: Record<string, unknown> | null;
  medications: unknown[] | null;
  created_at: string;
  users: { full_name: string; role: string } | null;
}

export interface MedicalReport {
  id: string;
  reference_number: string | null;
  report_date: string | null;
  content: string | null;
  author_name: string | null;
  author_title: string | null;
  created_at: string;
}

export interface InvoiceRow {
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

export interface AppointmentRow {
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
