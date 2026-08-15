"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Pill } from "lucide-react";
import { inDateRange } from "@/lib/daterange";
import DateRangeBar from "@/components/filters/date-range-bar";

interface RxItem {
  id: string;
  drug_id: string | null;
  medication_name: string;
  dosage: string;
  frequency: string;
  route: string | null;
  duration: string | null;
  quantity: number | null;
  refills: number | null;
  dispensed_qty: number | null;
  instructions: string | null;
}

interface Prescription {
  id: string;
  diagnosis: string | null;
  notes: string | null;
  status: string;
  pharmacy_type: string | null;
  external_pharmacy_name: string | null;
  issued_date: string;
  expires_date: string | null;
  patients: { first_name: string; last_name: string } | null;
  users: { full_name: string } | null;
  prescription_items: RxItem[];
}

function statusClass(status: string): string {
  switch (status) {
    case "dispensed": return "bg-emerald-100 text-emerald-700";
    case "pending": return "bg-sky-100 text-sky-700";
    case "processing": return "bg-indigo-100 text-indigo-700";
    case "partial": return "bg-amber-100 text-amber-700";
    case "cancelled": case "expired": return "bg-slate-100 text-slate-500";
    default: return "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]";
  }
}

export default function PatientPrescriptions() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/prescriptions?pageSize=100", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load prescriptions");
      setPrescriptions(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load prescriptions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = prescriptions.filter((rx) => inDateRange(rx.issued_date, from, to));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Prescriptions</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Medications prescribed for you and your family.</p>
      </div>

      <DateRangeBar from={from} to={to} onFromChange={setFrom} onToChange={setTo} onClear={() => { setFrom(""); setTo(""); }} />

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading prescriptions…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <Pill size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">No prescriptions yet.</p>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Your doctor&apos;s prescriptions will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((rx) => {
            const open = expanded === rx.id;
            return (
              <div key={rx.id} className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : rx.id)}
                  className="focus-ring flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left"
                >
                  <div className="flex items-center gap-3">
                    <ChevronDown size={16} aria-hidden="true" className={`text-[var(--color-muted-fg)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-foreground)]">
                        {rx.patients ? `${rx.patients.first_name} ${rx.patients.last_name}` : ""}
                        {rx.users?.full_name ? <span className="font-normal text-[var(--color-muted-fg)]"> · Dr. {rx.users.full_name}</span> : null}
                      </p>
                      <p className="text-xs text-[var(--color-muted-fg)]">
                        Issued {new Date(rx.issued_date).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                        {rx.expires_date ? ` · expires ${new Date(rx.expires_date).toLocaleDateString("en-NG")}` : ""}
                        {rx.diagnosis ? ` · ${rx.diagnosis}` : ""}
                        {rx.pharmacy_type === "external" ? ` · external pharmacy${rx.external_pharmacy_name ? `: ${rx.external_pharmacy_name}` : ""}` : ""}
                      </p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${statusClass(rx.status)}`}>
                    {rx.status.replace(/_/g, " ")}
                  </span>
                </button>

                {open && (
                  <div className="border-t border-[var(--color-border)] bg-slate-50/60 px-4 py-4">
                    <ul className="space-y-3">
                      {rx.prescription_items.map((item) => (
                        <li key={item.id} className="rounded-lg border border-[var(--color-border)] bg-white p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[var(--color-foreground)]">{item.medication_name}</p>
                            {item.dispensed_qty != null && (
                              <span className="text-xs text-[var(--color-muted-fg)]">
                                Dispensed: {item.dispensed_qty}
                                {item.quantity ? ` of ${item.quantity}` : ""}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
                            {item.dosage} · {item.frequency}
                            {item.route ? ` · ${item.route}` : ""}
                            {item.duration ? ` · for ${item.duration}` : ""}
                          </p>
                          {item.instructions && <p className="mt-1 text-xs italic text-[var(--color-muted-fg)]">{item.instructions}</p>}
                        </li>
                      ))}
                    </ul>
                    {rx.notes && (
                      <p className="mt-3 text-sm text-[var(--color-muted-fg)]">
                        <span className="font-medium text-[var(--color-foreground)]">Notes: </span>
                        {rx.notes}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
