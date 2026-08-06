"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pill, Plus, X } from "lucide-react";

interface RxItem {
  id: string;
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

interface Prescription {
  id: string;
  status: string;
  issued_date: string;
  diagnosis: string | null;
  notes: string | null;
  patients: { id: string; patient_number: string; first_name: string; last_name: string } | null;
  users: { id: string; full_name: string; role: string } | null;
  prescription_items: RxItem[];
}

const STATUS_FILTERS = ["all", "active", "partially_dispensed", "dispensed", "completed", "cancelled"];

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

function statusClass(status: string): string {
  switch (status) {
    case "active": return "bg-sky-100 text-sky-700";
    case "dispensed": return "bg-emerald-100 text-emerald-700";
    case "partially_dispensed": return "bg-amber-100 text-amber-700";
    case "completed": return "bg-slate-100 text-slate-600";
    default: return "bg-red-100 text-red-700";
  }
}

export default function PharmacyView({ canDispense }: { canDispense: boolean }) {
  const router = useRouter();
  const [rxs, setRxs] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (filter !== "all") params.set("status", filter);
      const res = await fetch(`/api/prescriptions?${params.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load prescriptions");
      setRxs(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load prescriptions");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const viewed = viewId ? rxs.find((r) => r.id === viewId) ?? null : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-foreground)]">
            Pharmacy
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
            Prescriptions and dispensing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]"
        >
          <Plus size={16} aria-hidden="true" /> New Prescription
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter prescriptions">
        {STATUS_FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            aria-pressed={filter === item}
            className={`focus-ring rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-colors duration-200 ${
              filter === item
                ? "bg-[var(--color-primary)] text-white"
                : "bg-white text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
            }`}
          >
            {item.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading prescriptions…</p>
      ) : rxs.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <Pill size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">No prescriptions found.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rxs.map((rx) => (
            <div key={rx.id} className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--color-foreground)]">
                    {rx.patients ? `${rx.patients.first_name} ${rx.patients.last_name}` : "Unknown"}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-[var(--color-muted-fg)]">
                    {rx.patients?.patient_number ?? ""} · {rx.issued_date}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClass(rx.status)}`}>
                  {rx.status.replace(/_/g, " ")}
                </span>
              </div>
              <p className="mt-3 text-xs text-[var(--color-muted-fg)]">
                {rx.prescription_items.length} medication(s) · by {rx.users?.full_name ?? "—"}
              </p>
              <button
                type="button"
                onClick={() => setViewId(rx.id)}
                className="focus-ring mt-3 w-full rounded-lg border border-[var(--color-border)] py-2 text-xs font-semibold text-[var(--color-primary)] transition-colors duration-200 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
              >
                View / dispense
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateRxModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
            router.refresh();
          }}
        />
      )}

      {viewed && (
        <RxDetailModal
          rx={viewed}
          canDispense={canDispense}
          onClose={() => setViewId(null)}
          onChanged={() => {
            load();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function CreateRxModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patients, setPatients] = useState<{ id: string; label: string }[]>([]);
  const [doctors, setDoctors] = useState<{ id: string; label: string }[]>([]);
  const [items, setItems] = useState([
    { medicationName: "", dosage: "1", frequency: "1x daily", route: "oral", duration: "", quantity: 10, instructions: "" },
  ]);

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
            .filter((s: { users?: { role?: string } }) => s.users?.role === "doctor")
            .map((s: { id: string; users?: { full_name?: string } }) => ({ id: s.id, label: s.users?.full_name ?? "Doctor" }))
        );
      } catch {
        /* options non-critical */
      }
    })();
  }, []);

  async function handleSubmit(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const cleanItems = items
        .filter((item) => item.medicationName.trim())
        .map((item) => ({
          medicationName: item.medicationName.trim(),
          dosage: item.dosage,
          frequency: item.frequency,
          route: item.route,
          duration: item.duration.trim() || undefined,
          quantity: item.quantity,
          instructions: item.instructions.trim() || undefined,
        }));
      const res = await fetch("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: form.get("patientId"),
          doctorId: form.get("doctorId"),
          diagnosis: (form.get("diagnosis") as string) || undefined,
          notes: (form.get("notes") as string) || undefined,
          items: cleanItems,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create prescription");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create prescription");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="New Prescription" onClose={onClose}>
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(new FormData(e.currentTarget));
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="rx-patient">Patient</label>
            <select id="rx-patient" name="patientId" required className={inputCls}>
              <option value="">Select patient…</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="rx-doctor">Doctor</label>
            <select id="rx-doctor" name="doctorId" required className={inputCls}>
              <option value="">Select doctor…</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="rx-dx">Diagnosis (optional)</label>
            <input id="rx-dx" name="diagnosis" className={inputCls} />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--color-foreground)]">Medications</span>
            <button
              type="button"
              onClick={() =>
                setItems([...items, { medicationName: "", dosage: "1", frequency: "1x daily", route: "oral", duration: "", quantity: 10, instructions: "" }])
              }
              className="focus-ring rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)]"
            >
              + Add medication
            </button>
          </div>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-3">
                <div className="grid grid-cols-12 gap-2">
                  <input
                    value={item.medicationName}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], medicationName: e.target.value };
                      setItems(next);
                    }}
                    placeholder="Medication name"
                    required
                    className={`${inputCls} col-span-12 sm:col-span-6`}
                  />
                  <input
                    value={item.dosage}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], dosage: e.target.value };
                      setItems(next);
                    }}
                    placeholder="Dosage"
                    className={`${inputCls} col-span-6 sm:col-span-2`}
                  />
                  <input
                    value={item.frequency}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], frequency: e.target.value };
                      setItems(next);
                    }}
                    placeholder="Frequency"
                    className={`${inputCls} col-span-6 sm:col-span-3`}
                  />
                  <input
                    value={item.route}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], route: e.target.value };
                      setItems(next);
                    }}
                    placeholder="Route"
                    className={`${inputCls} col-span-4 sm:col-span-2`}
                  />
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], quantity: Number(e.target.value) };
                      setItems(next);
                    }}
                    placeholder="Qty"
                    className={`${inputCls} col-span-4 sm:col-span-2`}
                  />
                  <input
                    value={item.duration}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], duration: e.target.value };
                      setItems(next);
                    }}
                    placeholder="Duration (e.g. 7 days)"
                    className={`${inputCls} col-span-4 sm:col-span-2`}
                  />
                  <input
                    value={item.instructions}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], instructions: e.target.value };
                      setItems(next);
                    }}
                    placeholder="Instructions (optional)"
                    className={`${inputCls} col-span-11 sm:col-span-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setItems(items.filter((_, i) => i !== idx))}
                    disabled={items.length === 1}
                    className="focus-ring col-span-1 flex items-center justify-center rounded-lg text-[var(--color-muted-fg)] hover:text-red-500 disabled:opacity-30"
                    aria-label="Remove medication"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="rx-notes">Notes (optional)</label>
          <textarea id="rx-notes" name="notes" rows={2} className={inputCls} />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
            {error}
          </p>
        )}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60">
            {busy ? "Saving…" : "Save prescription"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function RxDetailModal({
  rx,
  canDispense,
  onClose,
  onChanged,
}: {
  rx: Prescription;
  canDispense: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dispensed, setDispensed] = useState<Record<string, number>>(
    Object.fromEntries(rx.prescription_items.map((item) => [item.id, item.dispensed_qty]))
  );

  async function saveDispense() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/prescriptions/${rx.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dispenseItems: rx.prescription_items.map((item) => ({ id: item.id, dispensedQty: dispensed[item.id] ?? 0 })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save dispensing");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save dispensing");
    } finally {
      setBusy(false);
    }
  }

  async function cancelRx() {
    if (!confirm("Cancel this prescription?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/prescriptions/${rx.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to cancel prescription");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel prescription");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={`Prescription — ${rx.patients ? `${rx.patients.first_name} ${rx.patients.last_name}` : ""}`} onClose={onClose} wide>
      <div className="mt-5 space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(rx.status)}`}>
            {rx.status.replace(/_/g, " ")}
          </span>
          <span className="text-sm text-[var(--color-muted-fg)]">
            Issued {rx.issued_date} · by {rx.users?.full_name ?? "—"}
          </span>
          {rx.status !== "cancelled" && rx.status !== "completed" && (
            <button
              type="button"
              onClick={cancelRx}
              disabled={busy}
              className="focus-ring ml-auto rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              Cancel prescription
            </button>
          )}
        </div>

        {rx.diagnosis && (
          <p className="text-sm">
            <span className="font-semibold text-[var(--color-foreground)]">Diagnosis: </span>
            {rx.diagnosis}
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
            {error}
          </p>
        )}

        <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                <th scope="col" className="px-4 py-2.5 font-semibold">Medication</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Dosage</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Frequency</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Duration</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Qty</th>
                {canDispense && (
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">Dispensed</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rx.prescription_items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-[var(--color-foreground)]">{item.medication_name ?? "—"}</p>
                    {item.instructions && (
                      <p className="text-xs text-[var(--color-muted-fg)]">{item.instructions}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{item.dosage}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{item.frequency}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">
                    {item.duration ?? "—"} · {item.route ?? "oral"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold">{item.quantity}</td>
                  {canDispense && (
                    <td className="px-4 py-2.5 text-right">
                      <input
                        type="number"
                        min={0}
                        max={item.quantity}
                        value={dispensed[item.id] ?? 0}
                        onChange={(e) => setDispensed({ ...dispensed, [item.id]: Number(e.target.value) })}
                        className={`${inputCls} w-20 text-right`}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rx.notes && (
          <p className="text-sm text-[var(--color-muted-fg)]">
            <span className="font-semibold text-[var(--color-foreground)]">Notes: </span>
            {rx.notes}
          </p>
        )}

        {canDispense && rx.status !== "cancelled" && rx.status !== "completed" && (
          <button
            type="button"
            onClick={saveDispense}
            disabled={busy}
            className="focus-ring w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save dispensing & update status"}
          </button>
        )}
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
