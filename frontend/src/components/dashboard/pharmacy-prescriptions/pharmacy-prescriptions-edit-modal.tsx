import { useEffect, useState } from "react";
import { CLINICIAN_ROLES } from "@/lib/auth";
import { errorBanner, cardTitle } from "@/lib/ui-constants";
import { Prescription, inputCls, labelCls, ModalShell } from "./pharmacy-prescriptions-shared";
import { CreateItem, newItem, CreateItemRow } from "./pharmacy-prescriptions-create-item";

// ---------------------------------------------------------------------------
// Pharmacist workflow: view pending prescriptions, select stock batches for
// each item, dispense (full or partial), cancel, print the prescription.
// ---------------------------------------------------------------------------
export interface BatchOption {
  id: string;
  batchNumber: string;
  expiryDate: string;
  quantityOnHand: number;
  location: string | null;
}

export interface EditItem extends CreateItem {
  id: string | null;
}

// Pharmacy staff editing an existing prescription: add / remove / replace
// medications (free-text or catalogue), adjust dosage/frequency/quantity,
// and fix the diagnosis or notes. Saves via PUT /api/prescriptions/[id] with
// the FULL replacement item list.
export function EditRxModal({ rx, onClose, onSaved }: { rx: Prescription; onClose: () => void; onSaved: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patients, setPatients] = useState<{ id: string; label: string }[]>([]);
  const [doctors, setDoctors] = useState<{ id: string; label: string }[]>([]);
  const [patientId, setPatientId] = useState(rx.patient_id ?? "");
  const [doctorId, setDoctorId] = useState(rx.doctor_id ?? "");
  const [diagnosis, setDiagnosis] = useState(rx.diagnosis ?? "");
  const [notes, setNotes] = useState(rx.notes ?? "");
  const [items, setItems] = useState<EditItem[]>(() =>
    (rx.prescription_items ?? []).map((i) => ({
      id: i.id,
      medicationName: i.medication_name ?? "",
      pharmacyDrugId: i.pharmacy_drug_id,
      dosage: i.dosage,
      frequency: i.frequency,
      route: i.route ?? "oral",
      duration: i.duration ?? "",
      quantity: i.quantity,
      instructions: i.instructions ?? "",
    }))
  );

  useEffect(() => {
    (async () => {
      try {
        const [patientRes, staffRes] = await Promise.all([
          fetch("/api/patients?pageSize=100", { cache: "no-store" }),
          fetch("/api/staff?pageSize=100", { cache: "no-store" }),
        ]);
        const patientBody = await patientRes.json();
        const staffBody = await staffRes.json();
        setPatients(
          (patientBody.data ?? []).map((p: { id: string; first_name: string; last_name: string; patient_number: string }) => ({
            id: p.id,
            label: `${p.first_name} ${p.last_name} (${p.patient_number})`,
          }))
        );
        setDoctors(
          (staffBody.data ?? [])
            .filter((s: { users?: { role?: string } }) => !!s.users?.role && ["hospital_admin", "nurse", ...CLINICIAN_ROLES].includes(s.users.role as (typeof CLINICIAN_ROLES)[number]))
            .map((s: { id: string; users?: { id?: string; full_name?: string } }) => ({ id: s.users?.id ?? s.id, label: s.users?.full_name ?? "Doctor" }))
        );
      } catch {
        /* options non-critical */
      }
    })();
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const cleanItems = items
        .filter((item) => item.medicationName.trim())
        .map((item) => ({
          id: item.id ?? undefined,
          medicationName: item.medicationName.trim(),
          pharmacyDrugId: item.pharmacyDrugId ?? undefined,
          dosage: item.dosage,
          frequency: item.frequency,
          route: item.route,
          duration: item.duration.trim() || undefined,
          quantity: item.quantity,
          instructions: item.instructions.trim() || undefined,
        }));
      if (cleanItems.length === 0) throw new Error("Add at least one medication");

      const res = await fetch(`/api/prescriptions/${rx.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: patientId || undefined,
          doctorId: doctorId || undefined,
          diagnosis: diagnosis.trim() || undefined,
          notes: notes.trim() || undefined,
          items: cleanItems,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update prescription");
      onSaved(`Prescription updated — ${cleanItems.length} medication(s)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update prescription");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={`Edit prescription — ${rx.patients ? `${rx.patients.first_name} ${rx.patients.last_name}` : ""}`} onClose={onClose} wide>
      <div className="mt-5 space-y-4">
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Editing is allowed while nothing has been dispensed. Existing medications can be removed, new ones added, or any dosage/quantity adjusted.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="rx-edit-patient">Patient</label>
            <select id="rx-edit-patient" value={patientId} onChange={(e) => setPatientId(e.target.value)} className={inputCls}>
              <option value="">Select patient…</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="rx-edit-doctor">Doctor</label>
            <select id="rx-edit-doctor" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={inputCls}>
              <option value="">Select doctor…</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="rx-edit-dx">Diagnosis (optional)</label>
            <input
              id="rx-edit-dx"
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="e.g. Malaria, uncomplicated"
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className={cardTitle}>Medications</span>
            <button
              type="button"
              onClick={() => setItems([...items, { ...newItem(), id: null }])}
              className="focus-ring rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)]"
            >
              + Add medication
            </button>
          </div>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <CreateItemRow
                key={item.id ?? `new-${idx}`}
                item={item}
                onChange={(next) => {
                  const all = [...items];
                  all[idx] = { ...next, id: items[idx].id };
                  setItems(all);
                }}
                onRemove={() => setItems(items.filter((_, i) => i !== idx))}
                canRemove={items.length > 1}
              />
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="rx-edit-notes">Notes (optional)</label>
          <textarea id="rx-edit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
        </div>

        {error && (
          <p role="alert" className={errorBanner}>
            {error}
          </p>
        )}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={busy} className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60">
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
