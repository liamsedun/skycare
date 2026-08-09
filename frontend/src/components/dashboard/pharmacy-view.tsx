"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pill, Plus, X, Printer, Sparkles, AlertTriangle } from "lucide-react";
import { CLINICIAN_ROLES } from "@/lib/auth";

interface RxItem {
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

interface Prescription {
  id: string;
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

interface DrugOption {
  id: string;
  name: string;
  genericName: string | null;
  category: string | null;
  dosage: string | null;
  unitPrice: number;
  inStock: number;
}

interface AiRec {
  id: string;
  name: string;
  category: string | null;
  dosage: string | null;
  unitPrice: number | null;
  stockQty: number;
}

interface AiInteraction {
  drugAId: string;
  drugBId: string;
  drugAName: string;
  drugBName: string;
  severity: "major" | "moderate" | "minor";
  effect: string | null;
  advice: string | null;
}

interface AiAlternative {
  id: string;
  name: string;
  sameGeneric: boolean;
  inStock: boolean;
  stockQty: number;
  unitPrice: number | null;
}

interface AiPricing {
  suggestedLow: number;
  suggestedHigh: number;
  currentPrice: number;
}

const STATUS_FILTERS = ["all", "pending", "processing", "partial", "dispensed", "cancelled", "completed"];

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

function statusClass(status: string): string {
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

export default function PharmacyView({ canDispense }: { canDispense: boolean }) {
  const router = useRouter();
  const [rxs, setRxs] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Pharmacy</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
            Prescriptions, dispensing and stock.
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
        {success && (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            {success}
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
                {rx.prescription_items.length} medication(s) · by {rx.users?.full_name ?? "—"} ·{" "}
                {rx.pharmacy_type === "external" ? "External" : "In-house"}
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
          }}
        />
      )}

      {viewed && (
        <RxDetailModal
          rx={viewed}
          canDispense={canDispense}
          onClose={() => setViewId(null)}
          onChanged={() => load()}
          onDispensed={(msg) => {
            setSuccess(msg);
            setError(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Doctor workflow — create a prescription. Free-text allowed, but the med
// picker searches the pharmacy catalog (pharmacy_drugs) and links items so
// the pharmacist can allocate stock batches when dispensing.
// ---------------------------------------------------------------------------
function CreateRxModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patients, setPatients] = useState<{ id: string; label: string }[]>([]);
  const [doctors, setDoctors] = useState<{ id: string; label: string }[]>([]);
  const [pharmacyType, setPharmacyType] = useState<"in_house" | "external">("in_house");
  const [externalName, setExternalName] = useState("");
  const [items, setItems] = useState<CreateItem[]>([newItem()]);
  const [diagnosis, setDiagnosis] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiRecs, setAiRecs] = useState<AiRec[] | null>(null);
  const [aiAdded, setAiAdded] = useState<Set<string>>(new Set());

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
            .filter((s: { users?: { role?: string } }) => !!s.users?.role && CLINICIAN_ROLES.includes(s.users.role as (typeof CLINICIAN_ROLES)[number]))
            .map((s: { id: string; users?: { id?: string; full_name?: string } }) => ({ id: s.users?.id ?? s.id, label: s.users?.full_name ?? "Doctor" }))
        );
      } catch {
        /* options non-critical */
      }
    })();
  }, []);

  async function aiSuggest() {
    const dx = diagnosis.trim();
    if (dx.length < 3) {
      setAiError("Type a diagnosis (3+ characters) to get suggestions");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/pharmacy/ai/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagnosis: dx }),
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "AI suggestion failed");
      setAiRecs(body.data ?? []);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI suggestion failed");
      setAiRecs(null);
    } finally {
      setAiLoading(false);
    }
  }

  function addRec(r: AiRec) {
    if (aiAdded.has(r.id)) return;
    setItems((prev) => [
      ...prev,
      { ...newItem(), medicationName: r.name, pharmacyDrugId: r.id, dosage: r.dosage ?? "1" },
    ]);
    setAiAdded((prev) => new Set(prev).add(r.id));
  }

  function addAllRecs() {
    for (const r of aiRecs ?? []) addRec(r);
  }

  async function handleSubmit(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const cleanItems = items
        .filter((item) => item.medicationName.trim())
        .map((item) => ({
          medicationName: item.medicationName.trim(),
          pharmacyDrugId: item.pharmacyDrugId ?? undefined,
          dosage: item.dosage,
          frequency: item.frequency,
          route: item.route,
          duration: item.duration.trim() || undefined,
          quantity: item.quantity,
          instructions: item.instructions.trim() || undefined,
        }));
      if (pharmacyType === "external" && !externalName.trim()) {
        throw new Error("Enter the external pharmacy name");
      }
      const res = await fetch("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: form.get("patientId"),
          doctorId: form.get("doctorId"),
          diagnosis: (form.get("diagnosis") as string) || undefined,
          notes: (form.get("notes") as string) || undefined,
          pharmacyType,
          externalPharmacyName: pharmacyType === "external" ? externalName.trim() : undefined,
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
    <ModalShell title="New Prescription" onClose={onClose} wide>
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
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className={labelCls + " mb-0"} htmlFor="rx-dx">Diagnosis (optional)</label>
              <button
                type="button"
                onClick={aiSuggest}
                disabled={aiLoading || diagnosis.trim().length < 3}
                className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[var(--color-primary)]/40 px-2.5 py-1 text-xs font-semibold text-[var(--color-primary)] transition-colors duration-200 hover:bg-[var(--color-primary-soft)] disabled:opacity-50"
              >
                <Sparkles size={13} aria-hidden="true" />
                {aiLoading ? "Analysing…" : "AI medication suggestions"}
              </button>
            </div>
            <input
              id="rx-dx"
              name="diagnosis"
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="e.g. Malaria, uncomplicated"
              className={inputCls}
            />
            {aiError && (
              <p role="alert" className="mt-1 text-xs font-medium text-[var(--color-destructive)]">{aiError}</p>
            )}
            {aiRecs && (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
                    Suggested medications
                  </p>
                  {aiRecs.length > 0 && (
                    <button
                      type="button"
                      onClick={addAllRecs}
                      disabled={aiRecs.every((r) => aiAdded.has(r.id))}
                      className="focus-ring text-xs font-semibold text-[var(--color-primary)] hover:underline disabled:opacity-50"
                    >
                      Add all
                    </button>
                  )}
                </div>
                {aiRecs.length === 0 ? (
                  <p className="text-xs text-[var(--color-muted-fg)]">
                    No catalog match for this diagnosis — type medication names below.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {aiRecs.map((r) => {
                      const added = aiAdded.has(r.id);
                      const outOfStock = Number(r.stockQty ?? 0) <= 0;
                      return (
                        <li key={r.id} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[var(--color-foreground)]">{r.name}</p>
                            <p className="text-xs text-[var(--color-muted-fg)]">
                              {[r.category, r.dosage ? `dose ${r.dosage}` : null].filter(Boolean).join(" · ")}
                              {" · "}
                              {outOfStock ? (
                                <span className="font-semibold text-red-500">out of stock</span>
                              ) : (
                                <span className="font-semibold text-emerald-600">{r.stockQty} in stock</span>
                              )}
                              {Number(r.unitPrice ?? 0) > 0 && ` · ₦${Number(r.unitPrice).toLocaleString()}`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => addRec(r)}
                            disabled={added}
                            className="focus-ring shrink-0 rounded-lg border border-[var(--color-primary)] px-2.5 py-1 text-xs font-semibold text-[var(--color-primary)] transition-colors duration-200 hover:bg-[var(--color-primary-soft)] disabled:cursor-default disabled:border-[var(--color-border)] disabled:text-[var(--color-muted-fg)]"
                          >
                            {added ? "Added" : "Add"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Fulfilment</label>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Pharmacy type">
              <button
                type="button"
                onClick={() => setPharmacyType("in_house")}
                aria-pressed={pharmacyType === "in_house"}
                className={`focus-ring rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                  pharmacyType === "in_house"
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                    : "border-[var(--color-border)] text-[var(--color-muted-fg)]"
                }`}
              >
                In-house pharmacy
              </button>
              <button
                type="button"
                onClick={() => setPharmacyType("external")}
                aria-pressed={pharmacyType === "external"}
                className={`focus-ring rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                  pharmacyType === "external"
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                    : "border-[var(--color-border)] text-[var(--color-muted-fg)]"
                }`}
              >
                External pharmacy
              </button>
            </div>
          </div>
          {pharmacyType === "external" && (
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="rx-ext-name">External pharmacy name</label>
              <input
                id="rx-ext-name"
                value={externalName}
                onChange={(e) => setExternalName(e.target.value)}
                placeholder="e.g. HealthPlus Pharmacy, Ikeja"
                className={inputCls}
              />
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--color-foreground)]">Medications</span>
            <button
              type="button"
              onClick={() => setItems([...items, newItem()])}
              className="focus-ring rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)]"
            >
              + Add medication
            </button>
          </div>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <CreateItemRow
                key={idx}
                item={item}
                onChange={(next) => {
                  const all = [...items];
                  all[idx] = next;
                  setItems(all);
                }}
                onRemove={() => setItems(items.filter((_, i) => i !== idx))}
                canRemove={items.length > 1}
              />
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

interface CreateItem {
  medicationName: string;
  pharmacyDrugId: string | null;
  dosage: string;
  frequency: string;
  route: string;
  duration: string;
  quantity: number;
  instructions: string;
}

function newItem(): CreateItem {
  return { medicationName: "", pharmacyDrugId: null, dosage: "1", frequency: "1x daily", route: "oral", duration: "", quantity: 10, instructions: "" };
}

// Medication row with catalog search — type to search pharmacy_drugs; a match
// locks the pharmacyDrugId so dispensing can target stock batches.
function CreateItemRow({ item, onChange, onRemove, canRemove }: { item: CreateItem; onChange: (i: CreateItem) => void; onRemove: () => void; canRemove: boolean }) {
  const [query, setQuery] = useState(item.medicationName);
  const [results, setResults] = useState<DrugOption[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const debouncedSearch = useCallback((q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    fetch(`/api/pharmacy/drugs?query=${encodeURIComponent(q.trim())}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => setResults(body.data ?? []))
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, []);

  useEffect(() => {
    if (item.pharmacyDrugId) return;
    const t = setTimeout(() => debouncedSearch(query), 400);
    return () => clearTimeout(t);
  }, [query, item.pharmacyDrugId, debouncedSearch]);

  const pick = (d: DrugOption) => {
    onChange({ ...item, medicationName: d.name, pharmacyDrugId: d.id });
    setQuery(d.name);
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-3">
      <div className="grid grid-cols-12 gap-2">
        <div className="relative col-span-12 sm:col-span-6">
          <input
            ref={inputRef}
            value={item.pharmacyDrugId ? item.medicationName : query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              onChange({ ...item, medicationName: v, pharmacyDrugId: null });
            }}
            onFocus={() => {
              if (!item.pharmacyDrugId) setOpen(true);
            }}
            placeholder="Search medication (catalog)…"
            required
            className={inputCls}
          />
          {open && (searching || results.length > 0) && (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white shadow-lg">
              {searching && (
                <li className="px-3 py-2 text-xs text-[var(--color-muted-fg)]">Searching…</li>
              )}
              {!searching &&
                results.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => pick(d)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-primary-soft)]"
                    >
                      <span className="block font-medium text-[var(--color-foreground)]">{d.name}</span>
                      <span className="block text-xs text-[var(--color-muted-fg)]">
                        {[d.dosage, d.category].filter(Boolean).join(" · ") || " "}
                        {" · "}
                        {!d.inStock ? (
                          <span className="font-semibold text-red-500">out of stock</span>
                        ) : (
                          <span className="font-semibold text-emerald-600">in stock</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              {!searching && results.length === 0 && (
                <li className="px-3 py-2 text-xs text-[var(--color-muted-fg)]">No catalog match — free text allowed</li>
              )}
            </ul>
          )}
        </div>
        <input
          value={item.dosage}
          onChange={(e) => onChange({ ...item, dosage: e.target.value })}
          placeholder="Dosage"
          className={`${inputCls} col-span-6 sm:col-span-2`}
        />
        <input
          value={item.frequency}
          onChange={(e) => onChange({ ...item, frequency: e.target.value })}
          placeholder="Frequency"
          className={`${inputCls} col-span-6 sm:col-span-3`}
        />
        <input
          value={item.route}
          onChange={(e) => onChange({ ...item, route: e.target.value })}
          placeholder="Route"
          className={`${inputCls} col-span-4 sm:col-span-2`}
        />
        <input
          type="number"
          min={1}
          value={item.quantity}
          onChange={(e) => onChange({ ...item, quantity: Number(e.target.value) })}
          placeholder="Qty"
          className={`${inputCls} col-span-4 sm:col-span-2`}
        />
        <input
          value={item.duration}
          onChange={(e) => onChange({ ...item, duration: e.target.value })}
          placeholder="Duration (e.g. 7 days)"
          className={`${inputCls} col-span-4 sm:col-span-2`}
        />
        <input
          value={item.instructions}
          onChange={(e) => onChange({ ...item, instructions: e.target.value })}
          placeholder="Instructions (optional)"
          className={`${inputCls} col-span-11 sm:col-span-10`}
        />
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="focus-ring col-span-1 flex items-center justify-center rounded-lg text-[var(--color-muted-fg)] hover:text-red-500 disabled:opacity-30"
          aria-label="Remove medication"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pharmacist workflow: view pending prescriptions, select stock batches for
// each item, dispense (full or partial), cancel, print the prescription.
// ---------------------------------------------------------------------------
interface BatchOption {
  id: string;
  batchNumber: string;
  expiryDate: string;
  quantityOnHand: number;
  location: string | null;
}

function RxDetailModal({ rx, canDispense, onClose, onChanged, onDispensed }: { rx: Prescription; canDispense: boolean; onClose: () => void; onChanged: () => void; onDispensed: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batches, setBatches] = useState<Record<string, BatchOption[]>>({});
  const [batchSel, setBatchSel] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<Record<string, number>>({});
  const [printing, setPrinting] = useState(false);
  const [interactions, setInteractions] = useState<AiInteraction[]>([]);
  const [pricingByDrug, setPricingByDrug] = useState<Record<string, AiPricing>>({});
  const [alts, setAlts] = useState<Record<string, AiAlternative[]>>({});
  const [altLoadingFor, setAltLoadingFor] = useState<string | null>(null);

  const dispatchable = canDispense && !["cancelled", "dispensed", "completed"].includes(rx.status);

  // Load stock batches per item that has a pharmacy catalog link, then run the
  // AI assists: interaction watch across catalogued drugs + suggested retail
  // pricing per catalogued drug.
  useEffect(() => {
    const itemsWithDrug = rx.prescription_items.filter((i) => i.pharmacy_drug_id);
    if (itemsWithDrug.length === 0) return;
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        itemsWithDrug.map(async (i) => {
          try {
            const res = await fetch(`/api/pharmacy/drugs/${i.pharmacy_drug_id}/batches`, { cache: "no-store" });
            const body = await res.json();
            return [i.id, body.data?.batches ?? []] as const;
          } catch {
            return [i.id, [] as BatchOption[]] as const;
          }
        })
      );
      if (!alive) return;
      const map = Object.fromEntries(entries);
      setBatches(map);
      // Pre-select the largest available batch per item
      const sel: Record<string, string> = {};
      for (const [itemId, list] of entries) {
        if (list.length > 0) sel[itemId] = list[0].id;
      }
      setBatchSel(sel);

      // AI: dangerous-combination check across the catalogue drugs
      const drugIds = itemsWithDrug.map((i) => i.pharmacy_drug_id!);
      if (drugIds.length >= 2) {
        try {
          const res = await fetch("/api/pharmacy/ai/interactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ drugIds }),
            cache: "no-store",
          });
          const body = await res.json();
          if (alive && res.ok) setInteractions(body.data ?? []);
        } catch { /* non-critical */ }
      }

      // AI: suggested retail price band per catalogued drug
      const priceEntries = await Promise.all(
        drugIds.map(async (drugId) => {
          try {
            const res = await fetch(`/api/pharmacy/ai/pricing/${drugId}`, { cache: "no-store" });
            const body = await res.json();
            return res.ok && body.data ? ([drugId, body.data] as const) : null;
          } catch {
            return null;
          }
        })
      );
      if (alive) {
        setPricingByDrug(Object.fromEntries(priceEntries.filter((e): e is [string, AiPricing] => e !== null)));
      }
    })();
    return () => { alive = false; };
  }, [rx.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAlternatives(drugId: string) {
    if (alts[drugId]) return;
    setAltLoadingFor(drugId);
    try {
      const res = await fetch(`/api/pharmacy/ai/alternatives/${drugId}`, { cache: "no-store" });
      const body = await res.json();
      if (res.ok) setAlts((prev) => ({ ...prev, [drugId]: body.data ?? [] }));
    } catch { /* non-critical */ } finally {
      setAltLoadingFor(null);
    }
  }

  const remaining = (item: RxItem) => Math.max(0, item.quantity - item.dispensed_qty);

  async function saveDispense() {
    setBusy(true);
    setError(null);
    try {
const itemsPayload = rx.prescription_items
        .map((item) => {
          const qty = Math.floor(Number(plan[item.id] ?? 0) || 0);
          if (qty <= 0) return null;
          const hasCatalog = Boolean(item.pharmacy_drug_id);
          const isHouse = rx.pharmacy_type === "in_house";
          const batchId = hasCatalog && isHouse ? (batchSel[item.id] ?? null) : null;
          if (hasCatalog && isHouse && !batchId) {
            throw new Error(`No stock batch for "${item.medication_name ?? "item"}"`);
          }
          return { itemId: item.id, batchId, dispensedQty: qty };
        })
        .filter(Boolean) as Array<{ itemId: string; batchId: string | null; dispensedQty: number }>;
      if (itemsPayload.length === 0) throw new Error("Enter a dispensed quantity for at least one item");

      const res = await fetch(`/api/prescriptions/${rx.id}/dispense`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsPayload }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save dispensing");
      const autoInvoice = body.data?.autoInvoice as { invoice_number: string; total_amount: number } | null | undefined;
      onDispensed(
        autoInvoice
          ? `Fully dispensed — invoice ${autoInvoice.invoice_number} auto-created (₦${Number(autoInvoice.total_amount).toLocaleString()})`
          : "Dispensing saved"
      );
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save dispensing");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/prescriptions/${rx.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update prescription");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update prescription");
    } finally {
      setBusy(false);
    }
  }

  async function cancelRx() {
    if (!confirm("Cancel this prescription?")) return;
    await setStatus("cancelled");
  }

  async function printRx() {
    setPrinting(true);
    try {
      const res = await fetch(`/api/prescriptions/${rx.id}/pdf`, { method: "POST", cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to generate PDF");
      window.open(body.url, "_blank");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to print prescription");
    } finally {
      setPrinting(false);
    }
  }

  const external = rx.pharmacy_type === "external";

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
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            {external ? "External" : "In-house"}
          </span>
          <button
            type="button"
            onClick={printRx}
            disabled={printing}
            className="focus-ring ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] disabled:opacity-60"
          >
            <Printer size={14} /> {printing ? "Preparing…" : "Print"}
          </button>
        </div>

        {rx.diagnosis && (
          <p className="text-sm">
            <span className="font-semibold text-[var(--color-foreground)]">Diagnosis: </span>
            {rx.diagnosis}
          </p>
        )}
        {external && rx.external_pharmacy_name && (
          <p className="text-sm">
            <span className="font-semibold text-[var(--color-foreground)]">External pharmacy: </span>
            {rx.external_pharmacy_name}
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
            {error}
          </p>
        )}

        {interactions.length > 0 && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-foreground)]">
              <AlertTriangle size={15} className="text-amber-500" aria-hidden="true" />
              Interaction check
            </p>
            {interactions.map((ix) => {
              const strong = ix.severity === "major";
              const warn = ix.severity === "moderate";
              return (
                <div
                  key={`${ix.drugAId}-${ix.drugBId}`}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    strong
                      ? "border-red-200 bg-red-50 text-red-800"
                      : warn
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  <p className="font-semibold">
                    {ix.drugAName} + {ix.drugBName}
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        strong ? "bg-red-600 text-white" : warn ? "bg-amber-500 text-white" : "bg-slate-400 text-white"
                      }`}
                    >
                      {ix.severity}
                    </span>
                  </p>
                  {ix.effect && <p className="mt-0.5 text-xs">{ix.effect}</p>}
                  {ix.advice && <p className="mt-0.5 text-xs font-medium">Advice: {ix.advice}</p>}
                </div>
              );
            })}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                <th scope="col" className="px-4 py-2.5 font-semibold">Medication</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Dosage</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Frequency</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Qty</th>
                {canDispense && (
                  <>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Dispensed</th>
                    {!external && (
                      <th scope="col" className="px-4 py-2.5 font-semibold">Stock batch</th>
                    )}
                    {!external && (
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold">To dispense</th>
                    )}
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rx.prescription_items.map((item) => {
                const rem = remaining(item);
                const list = batches[item.id] ?? [];
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-[var(--color-foreground)]">{item.medication_name ?? "—"}</p>
                      {item.instructions && (
                        <p className="text-xs text-[var(--color-muted-fg)]">{item.instructions}</p>
                      )}
                      {item.pharmacy_drug_id &&
                        (() => {
                          const drugId = item.pharmacy_drug_id;
                          const price = pricingByDrug[drugId];
                          const outOfStock = !external && list.length > 0 && list.every((b) => b.quantityOnHand <= 0);
                          const altList = alts[drugId];
                          return (
                            <>
                              {price && price.suggestedLow > 0 && (
                                <p className="mt-0.5 text-[11px] font-medium text-emerald-700">
                                  Suggested retail ₦{Math.round(price.suggestedLow).toLocaleString()}–₦
                                  {Math.round(price.suggestedHigh).toLocaleString()}
                                  {price.currentPrice > 0 && price.currentPrice !== price.suggestedLow && (
                                    <span className="text-[var(--color-muted-fg)]">
                                      {" "}· current ₦{Math.round(price.currentPrice).toLocaleString()}
                                    </span>
                                  )}
                                </p>
                              )}
                              {outOfStock && (
                                <div className="mt-1">
                                  {altList ? (
                                    <div className="space-y-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-2">
                                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted-fg)]">
                                        Alternatives
                                      </p>
                                      {altList.length === 0 ? (
                                        <p className="text-xs text-[var(--color-muted-fg)]">
                                          No same-category alternatives in the catalog.
                                        </p>
                                      ) : (
                                        altList.map((alt) => (
                                          <p key={alt.id} className="text-xs text-[var(--color-foreground)]">
                                            <span className="font-semibold">{alt.name}</span>
                                            {alt.sameGeneric && (
                                              <span className="ml-1 rounded bg-sky-100 px-1 py-0.5 text-[9px] font-bold uppercase text-sky-700">
                                                same generic
                                              </span>
                                            )}
                                            <span className="text-[var(--color-muted-fg)]">
                                              {" · "}
                                              {alt.inStock ? `${alt.stockQty} in stock` : "out of stock"}
                                              {Number(alt.unitPrice ?? 0) > 0 && ` · ₦${Number(alt.unitPrice).toLocaleString()}`}
                                            </span>
                                          </p>
                                        ))
                                      )}
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => loadAlternatives(drugId)}
                                      disabled={altLoadingFor === drugId}
                                      className="focus-ring flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:underline disabled:opacity-50"
                                    >
                                      <Sparkles size={12} aria-hidden="true" />
                                      {altLoadingFor === drugId ? "Checking catalog…" : "Out of stock — find alternatives"}
                                    </button>
                                  )}
                                </div>
                              )}
                            </>
                          );
                        })()}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{item.dosage}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{item.frequency}</td>
                    <td className="px-4 py-2.5 font-semibold">{item.quantity}</td>
                    {canDispense && (
                      <>
                        <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">
                          {item.dispensed_qty}/{item.quantity}
                        </td>
                        {!external && (
                          <td className="px-4 py-2.5">
                            {item.pharmacy_drug_id ? (
                              <select
                                value={batchSel[item.id] ?? ""}
                                onChange={(e) => setBatchSel({ ...batchSel, [item.id]: e.target.value })}
                                className={`${inputCls} w-48`}
                              >
                                {list.length === 0 && <option value="">No stock</option>}
                                {list.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.batchNumber} · {b.quantityOnHand} left{b.location ? ` · ${b.location}` : ""}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs text-[var(--color-muted-fg)]">uncatalogued</span>
                            )}
                          </td>
                        )}
                        {!external && (
                          <td className="px-4 py-2.5 text-right">
                            <input
                              type="number"
                              min={0}
                              max={rem}
                              value={plan[item.id] ?? ""}
                              onChange={(e) => setPlan({ ...plan, [item.id]: Number(e.target.value) })}
                              placeholder={String(rem)}
                              className={`${inputCls} w-20 text-right`}
                            />
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {external && canDispense && (
          <p className="text-xs text-[var(--color-muted-fg)]">
            External prescription — record dispensing without stock deduction. Enter quantities below and save.
          </p>
        )}

        {rx.notes && (
          <p className="text-sm text-[var(--color-muted-fg)]">
            <span className="font-semibold text-[var(--color-foreground)]">Notes: </span>
            {rx.notes}
          </p>
        )}

        {canDispense && rx.status !== "cancelled" && rx.status !== "dispensed" && rx.status !== "completed" && (
          <div className="space-y-2">
            {rx.status === "pending" && (
              <button
                type="button"
                onClick={() => setStatus("processing")}
                disabled={busy}
                className="focus-ring w-full rounded-lg border border-[var(--color-primary)] py-2.5 text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] disabled:opacity-60"
              >
                Start processing
              </button>
            )}
            {!external && (
              <button
                type="button"
                onClick={saveDispense}
                disabled={busy}
                className="focus-ring w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {busy ? "Dispensing…" : "Dispense selected quantities"}
              </button>
            )}
            {external && (
              <button
                type="button"
                onClick={saveDispense}
                disabled={busy}
                className="focus-ring w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {busy ? "Recording…" : "Record dispensing"}
              </button>
            )}
            <button
              type="button"
              onClick={cancelRx}
              disabled={busy}
              className="focus-ring w-full rounded-lg border border-red-200 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              Cancel prescription
            </button>
          </div>
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
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ${wide ? "max-w-5xl" : "max-w-md"}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}