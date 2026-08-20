import { modalBackdrop, flexBetween, ghostIconBtn } from "@/lib/ui-constants";

export interface RxItem {
  id: string;
  pharmacy_drug_id: string | null;
  medication_name: string | null;
  dosage: string;
  frequency: string;
  route: string | null;
  duration: string | null;
  quantity: number;
  refills: number;
  dispensed_qty: number;
  instructions: string | null;
}

export interface Prescription {
  id: string;
  patient_id: string | null;
  doctor_id: string | null;
  status: string;
  pharmacy_type: "in_house" | "external";
  external_pharmacy_name: string | null;
  issued_date: string;
  diagnosis: string | null;
  notes: string | null;
  patients: { id: string; patient_number: string; first_name: string; last_name: string } | null;
  users: { id: string; full_name: string; role: string } | null;
  prescription_items: RxItem[];
}

export interface DrugOption {
  id: string;
  name: string;
  genericName: string | null;
  category: string | null;
  dosage: string | null;
  unitPrice: number;
  inStock: number;
}

export interface AiRec {
  id: string;
  name: string;
  category: string | null;
  dosage: string | null;
  unitPrice: number | null;
  stockQty: number;
}

export interface AiInteraction {
  drugAId: string;
  drugBId: string;
  drugAName: string;
  drugBName: string;
  severity: "major" | "moderate" | "minor";
  effect: string | null;
  advice: string | null;
}

export interface AiAlternative {
  id: string;
  name: string;
  sameGeneric: boolean;
  inStock: boolean;
  stockQty: number;
  unitPrice: number | null;
}

export interface AiPricing {
  suggestedLow: number;
  suggestedHigh: number;
  currentPrice: number;
}

export const STATUS_FILTERS = ["all", "pending", "processing", "partial", "dispensed", "cancelled", "completed"];

export const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
export const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

export function statusClass(status: string): string {
  switch (status) {
    case "pending": return "bg-amber-100 text-amber-700";
    case "processing": return "bg-indigo-100 text-indigo-700";
    case "dispensed": return "bg-emerald-100 text-emerald-700";
    case "partial": return "bg-orange-100 text-orange-700";
    case "completed": return "bg-slate-100 text-slate-600";
    case "cancelled": return "bg-red-100 text-red-700";
    default: return "bg-sky-100 text-sky-700";
  }
}

export function ModalShell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className={modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`my-4 w-full rounded-2xl bg-white p-6 shadow-2xl ${wide ? "max-w-5xl" : "max-w-md"}`}>
        <div className={flexBetween}>
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className={ghostIconBtn} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}