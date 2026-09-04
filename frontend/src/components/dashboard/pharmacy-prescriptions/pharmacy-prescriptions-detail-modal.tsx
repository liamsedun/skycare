import { useEffect, useState } from "react";
import { Printer, Pencil, Trash2, Sparkles, AlertTriangle } from "lucide-react";
import { mutedXs, mutedFg, errorBanner, btnBase, divideBorder, flexWrapGap2, fgMedium, fgSemibold, mutedSmPlain, tableHeadCell } from "@/lib/ui-constants";
import { useCurrency, currencySymbol } from "@/lib/currency";
import { RxItem, Prescription, AiInteraction, AiAlternative, AiPricing, inputCls, statusClass, ModalShell } from "./pharmacy-prescriptions-shared";
import { BatchOption, EditRxModal } from "./pharmacy-prescriptions-edit-modal";

export function RxDetailModal({ rx, canDispense, viewOnly = false, onClose, onChanged, onDispensed }: { rx: Prescription; canDispense: boolean; viewOnly?: boolean; onClose: () => void; onChanged: () => void; onDispensed: (msg: string) => void }) {
  const { currency } = useCurrency();
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
  const [editing, setEditing] = useState(false);

  const dispatchable = canDispense && !["cancelled", "dispensed", "completed"].includes(rx.status);

  // Pharmacy staff may add/remove/replace medications only while the
  // prescription is untouched: pending/processing and nothing dispensed yet.
  const editable =
    canDispense &&
    ["pending", "processing"].includes(rx.status) &&
    (rx.prescription_items ?? []).every((i) => (i.dispensed_qty ?? 0) <= 0);

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
          ? `Fully dispensed — invoice ${autoInvoice.invoice_number} auto-created (${currencySymbol(currency)}${Number(autoInvoice.total_amount).toLocaleString()})`
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

  async function deleteRx() {
    if (!confirm("Delete this prescription and its medications? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/prescriptions/${rx.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete prescription");
      onDispensed("Prescription deleted");
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete prescription");
    } finally {
      setBusy(false);
    }
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
        <div className={flexWrapGap2}>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(rx.status)}`}>
            {rx.status.replace(/_/g, " ")}
          </span>
          <span className={mutedSmPlain}>
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
          {!viewOnly && editable && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={busy}
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-foreground)] hover:bg-[var(--color-primary-soft)] disabled:opacity-60"
              >
                <Pencil size={14} /> Edit
              </button>
              <button
                type="button"
                onClick={deleteRx}
                disabled={busy}
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                <Trash2 size={14} /> Delete
              </button>
            </>
          )}
        </div>

        {rx.diagnosis && (
          <p className="text-sm">
            <span className={fgSemibold}>Diagnosis: </span>
            {rx.diagnosis}
          </p>
        )}
        {external && rx.external_pharmacy_name && (
          <p className="text-sm">
            <span className={fgSemibold}>External pharmacy: </span>
            {rx.external_pharmacy_name}
          </p>
        )}

        {error && (
          <p role="alert" className={errorBanner}>
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
              <tr className={tableHeadCell}>
                <th scope="col" className={btnBase}>Medication</th>
                <th scope="col" className={btnBase}>Dosage</th>
                <th scope="col" className={btnBase}>Frequency</th>
                <th scope="col" className={btnBase}>Qty</th>
                {canDispense && !viewOnly && (
                  <>
                    <th scope="col" className={btnBase}>Dispensed</th>
                    {!external && (
                      <th scope="col" className={btnBase}>Stock batch</th>
                    )}
                    {!external && (
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold">To dispense</th>
                    )}
                  </>
                )}
              </tr>
            </thead>
            <tbody className={divideBorder}>
              {rx.prescription_items.map((item) => {
                const rem = remaining(item);
                const list = batches[item.id] ?? [];
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-2.5">
                      <p className={fgMedium}>{item.medication_name ?? "—"}</p>
                      {item.instructions && (
                        <p className={mutedXs}>{item.instructions}</p>
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
                               Suggested retail {currencySymbol(currency)}{Math.round(price.suggestedLow).toLocaleString()}–{currencySymbol(currency)}
                                   {Math.round(price.suggestedHigh).toLocaleString()}
                                  {price.currentPrice > 0 && price.currentPrice !== price.suggestedLow && (
                                    <span className={mutedFg}>
                                       {" "}· current {currencySymbol(currency)}{Math.round(price.currentPrice).toLocaleString()}
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
                                        <p className={mutedXs}>
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
                                            <span className={mutedFg}>
                                              {" · "}
                                              {alt.inStock ? `${alt.stockQty} in stock` : "out of stock"}
                                              {Number(alt.unitPrice ?? 0) > 0 && ` · ${currencySymbol(currency)}${Number(alt.unitPrice).toLocaleString()}`}
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
                    <td className={btnBase}>{item.quantity}</td>
                    {canDispense && !viewOnly && (
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
                              <span className={mutedXs}>uncatalogued</span>
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

        {external && canDispense && !viewOnly && (
          <p className={mutedXs}>
            External prescription — record dispensing without stock deduction. Enter quantities below and save.
          </p>
        )}

        {rx.notes && (
          <p className={mutedSmPlain}>
            <span className={fgSemibold}>Notes: </span>
            {rx.notes}
          </p>
        )}

        {canDispense && !viewOnly && rx.status !== "cancelled" && rx.status !== "dispensed" && rx.status !== "completed" && (
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

      {editing && (
        <EditRxModal
          rx={rx}
          onClose={() => setEditing(false)}
          onSaved={(msg) => {
            setEditing(false);
            onDispensed(msg);
            onChanged();
            onClose();
          }}
        />
      )}
    </ModalShell>
  );
}