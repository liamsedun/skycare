export interface LabService {
  id: string;
  category_id: string | null;
  name: string;
  type: "lab" | "imaging";
  is_custom: boolean;
  external_lab_id: string | null;
  approval_status: "approved" | "pending" | "rejected";
  price: number;
  reference_range: string | null;
  is_active: boolean;
  lab_categories: { id: string; name: string } | null;
}

export interface LabRequest {
  id: string;
  status: string;
  is_external: boolean;
  external_lab_id: string | null;
  requested_at: string;
  notes: string | null;
  invoice_id: string | null;
  payment_id: string | null;
  referrer: string | null;
  patients: { id: string; patient_number: string; first_name: string; last_name: string; user_id: string | null; is_walk_in: boolean | null } | null;
  users: { id: string; full_name: string } | null;
  lab_request_items: Array<{
    id: string;
    service_id: string | null;
    service_name: string;
    priority: string;
    sample_type: string | null;
    notes: string | null;
    result: string | null;
    result_unit: string | null;
    is_abnormal: boolean | null;
    reported_at: string | null;
  }>;
  lab_request_assignments?: Array<{
    user_id: string;
    users: { id: string; full_name: string; role: string } | null;
  }>;
  invoices?: { id: string; invoice_number: string; status: string; total_amount: number } | null;
  payments?: { id: string; reference: string | null; payment_method: string | null; amount: number; status: string; paid_at: string | null } | null;
}

export const STATUS_FILTERS = ["all", "requested", "sample_collected", "in_progress", "completed", "cancelled"];

export const REQUEST_EXPORT_COLUMNS = [
  "patient",
  "patient_number",
  "status",
  "requested_at",
  "requested_by",
  "services",
  "notes",
  "is_external",
  "invoice_number",
];

export const SERVICE_EXPORT_COLUMNS = [
  "name",
  "type",
  "category",
  "price",
  "reference_range",
  "approval_status",
  "is_active",
  "external_lab_id",
];

export const REQUEST_IMPORT_COLUMNS = ["patient_id", "service_name", "priority", "sample_type", "notes"];
export const REQUEST_IMPORT_SAMPLE = [
  ["<patient UUID>", "Malaria Parasite", "routine", "Blood", "Routine check"],
];

export const SERVICE_IMPORT_COLUMNS = ["name", "type", "price", "new_category", "reference_range", "external_lab_id"];
export const SERVICE_IMPORT_SAMPLE = [
  ["Vitamin D Test", "lab", "15000", "Endocrinology", "30–100 ng/mL", ""],
];

export const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
export const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

export function statusClass(status: string): string {
  switch (status) {
    case "requested": return "bg-slate-100 text-slate-600";
    case "sample_collected": return "bg-sky-100 text-sky-700";
    case "in_progress": return "bg-amber-100 text-amber-700";
    case "completed": return "bg-emerald-100 text-emerald-700";
    default: return "bg-red-100 text-red-700";
  }
}

export function approvalBadge(status: string): string {
  switch (status) {
    case "approved": return "bg-emerald-100 text-emerald-700";
    case "pending": return "bg-amber-100 text-amber-700";
    default: return "bg-red-100 text-red-700";
  }
}