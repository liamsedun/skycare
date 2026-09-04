import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { CLINICIAN_ROLES } from "@/lib/auth";
import { mutedXs, errorBanner, cardTitle, flexBetween } from "@/lib/ui-constants";
import { useCurrency, currencySymbol } from "@/lib/currency";
import { AiRec, inputCls, labelCls, ModalShell } from "./pharmacy-prescriptions-shared";
import { CreateItem, newItem, CreateItemRow } from "./pharmacy-prescriptions-create-item";

// ---------------------------------------------------------------------------
// Doctor workflow — create a prescription. Free-text allowed, but the med
// picker searches the pharmacy catalog (pharmacy_drugs) and links items so
// the pharmacist can allocate stock batches when dispensing.
// ---------------------------------------------------------------------------
export function CreateRxModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { currency } = useCurrency();
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
            .filter((s: { users?: { role?: string } }) => !!s.users?.role && ["hospital_admin", "nurse", ...CLINICIAN_ROLES].includes(s.users.role as (typeof CLINICIAN_ROLES)[number]))
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
                <div className={flexBetween}>
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
                  <p className={mutedXs}>
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
                            <p className={mutedXs}>
                              {[r.category, r.dosage ? `dose ${r.dosage}` : null].filter(Boolean).join(" · ")}
                              {" · "}
                              {outOfStock ? (
                                <span className="font-semibold text-red-500">out of stock</span>
                              ) : (
                                <span className="font-semibold text-emerald-600">{r.stockQty} in stock</span>
                              )}
                              {Number(r.unitPrice ?? 0) > 0 && ` · ${currencySymbol(currency)}${Number(r.unitPrice).toLocaleString()}`}
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
            <span className={cardTitle}>Medications</span>
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
          <p role="alert" className={errorBanner}>
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
