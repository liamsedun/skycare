"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarPlus, FileDown, Loader2, ReceiptText } from "lucide-react";
import { CLINICIAN_ROLES } from "@/lib/auth";
import { btnBase, cardTitle, divideBorder, errorBanner, fgMedium, fgSemibold, flexWrapGap2, mutedFg, mutedSmPlain, mutedXsMt, rowStart, tableHeadCell } from "@/lib/ui-constants";
import { useCurrency, currencySymbol } from "@/lib/currency";
import { LabRequest, LabService, inputCls, labelCls, statusClass } from "./lab-shared";
import { ModalShell } from "./lab-modal-shell";

// ---------------------------------------------------------------------------
// CREATE REQUEST MODAL — patient + optional doctor + services grouped by category
// ---------------------------------------------------------------------------
export function CreateRequestModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { currency } = useCurrency();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patients, setPatients] = useState<{ id: string; label: string }[]>([]);
  const [doctors, setDoctors] = useState<{ id: string; label: string }[]>([]);
  const [labStaff, setLabStaff] = useState<{ id: string; label: string }[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [isExternal, setIsExternal] = useState(false);
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [payMethod, setPayMethod] = useState("cash");
  const [payAccount, setPayAccount] = useState("cash");
  const [bankAccounts, setBankAccounts] = useState<{ id: string; bank_name: string; account_name: string; account_number: string }[]>([]);
  const [createdReceipt, setCreatedReceipt] = useState<string | null>(null);
  const [services, setServices] = useState<LabService[]>([]);
  const [selected, setSelected] = useState<Record<string, { sampleType: string; priority: string }>>({});

  useEffect(() => {
    (async () => {
      try {
        const [patientRes, staffRes, serviceRes, bankRes] = await Promise.all([
          fetch("/api/patients?pageSize=100", { cache: "no-store" }),
          fetch("/api/staff?pageSize=100", { cache: "no-store" }),
          fetch("/api/lab-services?pageSize=500", { cache: "no-store" }),
          fetch("/api/settings/bank-accounts", { cache: "no-store" }),
        ]);
        const patientBody = await patientRes.json();
        const staffBody = await staffRes.json();
        const serviceBody = await serviceRes.json();
        setPatients(
          (patientBody.data ?? []).map((p: { id: string; first_name: string; last_name: string; patient_number: string }) => ({
            id: p.id,
            label: `${p.first_name} ${p.last_name} (${p.patient_number})`,
          }))
        );
        setDoctors(
          (staffBody.data ?? [])
            .filter((s: { users?: { role?: string } }) => !!s.users?.role && ["hospital_admin", "nurse", ...CLINICIAN_ROLES].includes(s.users.role as (typeof CLINICIAN_ROLES)[number]))
            .map((s: { id: string; users?: { id?: string; full_name?: string } }) => ({
              id: s.users?.id ?? s.id,
              label: s.users?.full_name ?? "Doctor",
            }))
        );
        setLabStaff(
          (staffBody.data ?? [])
            .filter((s: { users?: { role?: string; is_active?: boolean } }) => !!s.users?.is_active && ["lab_tech", "radiologist", "radiographer", "hospital_admin"].includes(s.users.role ?? ""))
            .map((s: { id: string; users?: { id?: string; full_name?: string } }) => ({
              id: s.users?.id ?? s.id,
              label: s.users?.full_name ?? "Lab staff",
            }))
        );
        setServices(
          (serviceBody.data ?? []).filter(
            (s: LabService) => s.is_active && s.approval_status === "approved"
          )
        );
        if (bankRes.ok) {
          const bb = await bankRes.json();
          setBankAccounts(bb.data ?? []);
        }
      } catch {
        /* options non-critical */
      }
    })();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, LabService[]>();
    for (const s of services) {
      const key = s.lab_categories?.name ?? "Uncategorized";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [services]);

  const selectedTotal = useMemo(() => {
    const priceById = new Map(services.map((s) => [s.id, Number(s.price) || 0]));
    return Object.keys(selected).reduce((sum, id) => sum + (priceById.get(id) ?? 0), 0);
  }, [services, selected]);

  async function handleSubmit(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const items = Object.entries(selected).map(([serviceId, opts]) => ({
        serviceId,
        priority: opts.priority || "routine",
        sampleType: opts.sampleType || undefined,
      }));
      if (form.get("walkIn") === "on") {
        const res = await fetch("/api/lab-requests/walk-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: form.get("wiFirstName"),
            lastName: form.get("wiLastName"),
            phone: (form.get("wiPhone") as string) || undefined,
            email: (form.get("wiEmail") as string) || undefined,
            referrer: (form.get("wiReferrer") as string) || undefined,
            doctorId: (form.get("doctorId") as string) || undefined,
            notes: (form.get("notes") as string) || undefined,
            assignedToIds: assigned.size ? Array.from(assigned) : undefined,
            paymentMethod: form.get("payMethod"),
            accountId: payMethod === "cash" ? "cash" : payAccount,
            transactionRef: (form.get("transactionRef") as string) || undefined,
            items,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to create walk-in lab request");
        if (body.data?.authorization_url) {
          window.open(body.data.authorization_url, "_blank", "noopener,noreferrer");
        }
        if (body.data?.receipt_url) setCreatedReceipt(body.data.receipt_url as string);
        else onCreated();
        return;
      }
      const res = await fetch("/api/lab-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: form.get("patientId"),
          doctorId: (form.get("doctorId") as string) || undefined,
          isExternal: form.get("isExternal") === "on",
          externalLabId: (form.get("externalLabId") as string) || undefined,
          notes: (form.get("notes") as string) || undefined,
          assignedToIds: assigned.size ? Array.from(assigned) : undefined,
          items,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create lab request");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create lab request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="New Lab Request" onClose={onClose} wide>
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(new FormData(e.currentTarget));
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--color-foreground)]">
            <input
              type="checkbox"
              name="walkIn"
              checked={isWalkIn}
              onChange={(e) => {
                setIsWalkIn(e.target.checked);
                if (e.target.checked) setIsExternal(false);
              }}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            Walk-in / external customer (no patient record)
          </label>
        </div>

        {isWalkIn ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="wi-first">First name</label>
              <input id="wi-first" name="wiFirstName" required className={inputCls} placeholder="Customer first name" />
            </div>
            <div>
              <label className={labelCls} htmlFor="wi-last">Last name</label>
              <input id="wi-last" name="wiLastName" required className={inputCls} placeholder="Customer last name" />
            </div>
            <div>
              <label className={labelCls} htmlFor="wi-phone">Phone</label>
              <input id="wi-phone" name="wiPhone" className={inputCls} placeholder="e.g. 0803 000 0000" />
            </div>
            <div>
              <label className={labelCls} htmlFor="wi-email">Email {payMethod === "paystack" && <span className={mutedFg}>(required for Paystack)</span>}</label>
              <input id="wi-email" name="wiEmail" type="email" required={payMethod === "paystack"} className={inputCls} placeholder="customer@example.com" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="wi-referrer">Referring clinic / source (optional)</label>
              <input id="wi-referrer" name="wiReferrer" className={inputCls} placeholder="e.g. Harmony Clinic, Ikeja" />
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className={labelCls} htmlFor="lr-patient">Patient</label>
              <select id="lr-patient" name="patientId" required className={inputCls}>
                <option value="">Select patient…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls} htmlFor="lr-doctor">Doctor (optional)</label>
              <select id="lr-doctor" name="doctorId" className={inputCls}>
                <option value="">No doctor assigned</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--color-foreground)]">
                <input
                  type="checkbox"
                  name="isExternal"
                  checked={isExternal}
                  onChange={(e) => {
                    setIsExternal(e.target.checked);
                    if (e.target.checked) setAssigned(new Set());
                  }}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                Send to an external lab
              </label>
              <input name="externalLabId" className={`${inputCls} !py-2 max-w-xs flex-1 text-sm`} placeholder="External lab ID (optional)" />
            </div>
          </>
        )}

        {!isExternal && (
          <div>
            <span className="mb-2 block text-sm font-semibold text-[var(--color-foreground)]">
              Assign lab staff ({assigned.size} selected)
              <span className="ml-1 font-normal text-xs text-[var(--color-muted-fg)]">— they&apos;ll be notified to run the tests</span>
            </span>
            {labStaff.length === 0 ? (
              <p className="rounded-lg bg-[var(--color-muted)]/40 px-3 py-2 text-xs text-[var(--color-muted-fg)]">
                No lab staff available yet. Ask an admin to add lab technicians — the request will go to all lab staff.
              </p>
            ) : (
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-[var(--color-border)] p-3">
                {labStaff.map((s) => {
                  const on = assigned.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150 ${
                        on ? "bg-[var(--color-primary-soft)]" : "hover:bg-[var(--color-muted)]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => {
                          const next = new Set(assigned);
                          if (e.target.checked) next.add(s.id);
                          else next.delete(s.id);
                          setAssigned(next);
                        }}
                        className="h-4 w-4 accent-[var(--color-primary)]"
                      />
                      <span className={fgMedium}>{s.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div>
          <span className="mb-2 block text-sm font-semibold text-[var(--color-foreground)]">
            Services ({Object.keys(selected).length} selected)
          </span>
          {grouped.length === 0 ? (
            <p className="rounded-lg bg-[var(--color-muted)]/40 px-3 py-2 text-xs text-[var(--color-muted-fg)]">
              No approved services yet. Ask an admin to approve services or add new ones.
            </p>
          ) : (
            <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-[var(--color-border)] p-3">
              {grouped.map(([category, items]) => (
                <div key={category}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">{category}</p>
                  <div className="space-y-1">
                    {items.map((svc) => (
                      <label
                        key={svc.id}
                        className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150 ${
                          selected[svc.id] ? "bg-[var(--color-primary-soft)]" : "hover:bg-[var(--color-muted)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={!!selected[svc.id]}
                          onChange={(e) => {
                            const next = { ...selected };
                            if (e.target.checked) next[svc.id] = { sampleType: "", priority: "routine" };
                            else delete next[svc.id];
                            setSelected(next);
                          }}
                          className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
                        />
                        <span className="flex-1">
                          <span className={fgMedium}>{svc.name}</span>
                          <span className="ml-2 text-xs text-[var(--color-muted-fg)]">
                            {svc.type === "imaging" ? "imaging" : "lab"} · {currencySymbol(currency)}{Number(svc.price).toLocaleString()}
                          </span>
                          {selected[svc.id] && (
                            <span className="mt-1 flex gap-2">
                              <input
                                type="text"
                                placeholder="Sample type (e.g. blood)"
                                value={selected[svc.id].sampleType}
                                onChange={(e) =>
                                  setSelected({ ...selected, [svc.id]: { ...selected[svc.id], sampleType: e.target.value } })
                                }
                                className={`${inputCls} !py-1 text-xs`}
                              />
                              <select
                                value={selected[svc.id].priority}
                                onChange={(e) =>
                                  setSelected({ ...selected, [svc.id]: { ...selected[svc.id], priority: e.target.value } })
                                }
                                className={`${inputCls} !py-1 text-xs`}
                              >
                                <option value="routine">Routine</option>
                                <option value="urgent">Urgent</option>
                                <option value="stat">STAT</option>
                              </select>
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {isWalkIn && (
          <div className="rounded-xl border border-[var(--color-border)] p-3">
            <p className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">
              Instant payment — {currencySymbol(currency)}{selectedTotal.toLocaleString()}
              <span className="ml-1 text-xs font-normal text-[var(--color-muted-fg)]">
                (walk-in customers pay up-front; credit is not available)
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-4">
              {[
                { value: "cash", label: "Cash" },
                { value: "bank_transfer", label: "Bank transfer" },
                { value: "paystack", label: "Paystack (card)" },
              ].map((m) => (
                <label key={m.value} className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-[var(--color-foreground)]">
                  <input
                    type="radio"
                    name="payMethod"
                    value={m.value}
                    checked={payMethod === m.value}
                    onChange={() => setPayMethod(m.value)}
                    className="h-4 w-4 accent-[var(--color-primary)]"
                  />
                  {m.label}
                </label>
              ))}
            </div>
            {payMethod === "bank_transfer" && (
              <input name="transactionRef" className={`${inputCls} !py-2 mt-2 max-w-sm text-sm`} placeholder="Transfer reference (optional)" />
            )}
            {payMethod !== "cash" && (
              <div className="mt-3">
                <label className={labelCls} htmlFor="wi-account">Deposit into</label>
                <select id="wi-account" value={payAccount} onChange={(e) => setPayAccount(e.target.value)} className={inputCls + " max-w-sm"}>
                  <option value="cash">Cash</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>{b.bank_name} • {b.account_name} ({b.account_number})</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <div>
          <label className={labelCls} htmlFor="lr-notes">Notes (optional)</label>
          <textarea id="lr-notes" name="notes" rows={2} className={inputCls} />
        </div>

        {error && (
          <p role="alert" className={errorBanner}>
            {error}
          </p>
        )}
        {createdReceipt && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm">
            <p className="font-medium text-emerald-700">Payment received — lab request created.</p>
            <a href={createdReceipt} className="mt-1 inline-block text-sm font-semibold text-emerald-700 underline">
              Open payment receipt
            </a>
          </div>
        )}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50">
            {createdReceipt ? "Done" : "Cancel"}
          </button>
          {!createdReceipt && (
            <button
              type="submit"
              disabled={busy || Object.keys(selected).length === 0}
              className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
            >
              {busy
                ? "Creating…"
                : isWalkIn
                  ? `Collect ${currencySymbol(currency)}${selectedTotal.toLocaleString()} & create request`
                  : "Create lab request"}
            </button>
          )}
        </div>
      </form>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// REQUEST DETAIL MODAL — status flow + items
// ---------------------------------------------------------------------------
export function RequestDetailModal({
  request,
  canEnterResults,
  canBill,
  onClose,
  onChanged,
}: {
  request: LabRequest;
  canEnterResults: boolean;
  canBill: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { currency } = useCurrency();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [billing, setBilling] = useState(false);
  const [resultDraft, setResultDraft] = useState<Record<string, { result: string; unit: string; isAbnormal: boolean }>>({});

  async function downloadPdf() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/lab-requests/${request.id}/print`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to prepare PDF");
      const { generateLabPDF } = await import("@/components/pdf/generateLabPDF");
      const url = await generateLabPDF(body.data ?? body);
      const link = document.createElement("a");
      link.href = url;
      link.download = `lab-request-${request.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  }

  async function updateStatus(status: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/lab-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update request");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update request");
    } finally {
      setBusy(false);
    }
  }

  async function generateInvoice() {
    if (!confirm("Raise an invoice from this lab request now? It will appear in the patient's portal as an outstanding payment until paid (bank transfer, cash, Paystack, or credit).")) return;
    setBilling(true);
    setError(null);
    try {
      const res = await fetch(`/api/lab-requests/${request.id}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to generate invoice");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate invoice");
    } finally {
      setBilling(false);
    }
  }

  async function reportResults() {
    setBusy(true);
    setError(null);
    try {
      const results = request.lab_request_items.map((item) => {
        const draft = resultDraft[item.id] ?? { result: "", unit: "", isAbnormal: false };
        return {
          itemId: item.id,
          result: draft.result,
          unit: draft.unit,
          isAbnormal: draft.isAbnormal,
        };
      });
      if (results.some((r) => !r.result.trim())) {
        throw new Error("Fill in a result value for every service first");
      }
      const res = await fetch(`/api/lab-requests/${request.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to report results");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to report results");
    } finally {
      setBusy(false);
    }
  }

  const canWork = ["requested", "sample_collected", "in_progress"].includes(request.status);

  return (
    <ModalShell
      title={`Lab request — ${request.patients ? `${request.patients.first_name} ${request.patients.last_name}` : ""}`}
      onClose={onClose}
      wide
    >
      <div className="mt-5 space-y-6">
        <div className={flexWrapGap2}>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(request.status)}`}>
            {request.status.replace(/_/g, " ")}
          </span>
          {request.is_external && (
            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
              External{request.external_lab_id ? ` · ${request.external_lab_id}` : ""}
            </span>
          )}
          {request.patients?.is_walk_in && (
            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
              Walk-in{request.referrer ? ` · ${request.referrer}` : ""}
            </span>
          )}
          <span className={mutedSmPlain}>
            Requested {new Date(request.requested_at).toLocaleString()}
            {request.users ? ` · by ${request.users.full_name}` : ""}
          </span>
          {canWork && canEnterResults && request.status === "requested" && (
            <button
              type="button"
              onClick={() => updateStatus("sample_collected")}
              disabled={busy}
              className="focus-ring ml-auto rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)] disabled:opacity-60"
            >
              Sample collected
            </button>
          )}
          {canWork && (
            <button
              type="button"
              onClick={() => setShowSchedule(true)}
              disabled={busy}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)] disabled:opacity-60"
            >
              <CalendarPlus size={14} aria-hidden="true" /> Schedule collection
            </button>
          )}
          {request.status !== "cancelled" && (
            <button
              type="button"
              onClick={downloadPdf}
              disabled={downloading}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)] disabled:opacity-60"
            >
              <FileDown size={14} aria-hidden="true" /> {downloading ? "Preparing…" : "Download PDF"}
            </button>
          )}
          {request.payments ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700" title="Walk-in payment received up-front">
              <ReceiptText size={13} aria-hidden="true" />
              Paid · {request.payments.reference ?? "—"} · {request.payments.payment_method?.replace(/_/g, " ") ?? "—"} · {currencySymbol(currency)}
              {Number(request.payments.amount).toLocaleString()}
            </span>
          ) : null}
          {request.payments && (
            <Link
              href={`/app/lab/receipt/${request.id}`}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              <ReceiptText size={13} aria-hidden="true" /> Receipt
            </Link>
          )}
          {!request.payments &&
            (request.invoices ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                title="Invoice generated for this request"
              >
                <ReceiptText size={13} aria-hidden="true" />
                {request.invoices.invoice_number} · {request.invoices.status.replace(/_/g, " ")} · {currencySymbol(currency)}
                {Number(request.invoices.total_amount).toLocaleString()}
              </span>
            ) : canBill && request.status !== "cancelled" ? (
              <button
                type="button"
                onClick={generateInvoice}
                disabled={billing}
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
              >
                {billing ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                ) : (
                  <ReceiptText size={14} aria-hidden="true" />
                )}
                {billing ? "Generating…" : "Generate invoice & bill"}
              </button>
            ) : null)}
          {canWork && canEnterResults && request.status === "sample_collected" && (
            <button
              type="button"
              onClick={() => updateStatus("in_progress")}
              disabled={busy}
              className="focus-ring ml-auto rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)] disabled:opacity-60"
            >
              In progress
            </button>
          )}
          {canWork && (
            <button
              type="button"
              onClick={() => {
                if (!confirm("Cancel this lab request?")) return;
                updateStatus("cancelled");
              }}
              disabled={busy}
              className="focus-ring rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              Cancel
            </button>
          )}
        </div>

        {request.notes && (
          <p className={mutedSmPlain}>
            <span className={fgSemibold}>Notes: </span>
            {request.notes}
          </p>
        )}

        {request.lab_request_assignments && request.lab_request_assignments.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Assigned to:</span>
            {request.lab_request_assignments.map((a) => (
              <span key={a.user_id} className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                {a.users?.full_name ?? "Lab staff"}
              </span>
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className={errorBanner}>
            {error}
          </p>
        )}

        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className={rowStart}>
            <thead>
              <tr className={tableHeadCell}>
                <th scope="col" className={btnBase}>Service</th>
                <th scope="col" className={btnBase}>Priority</th>
                <th scope="col" className={btnBase}>Sample</th>
                <th scope="col" className={btnBase}>Result</th>
              </tr>
            </thead>
            <tbody className={divideBorder}>
              {request.lab_request_items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2.5 font-medium text-[var(--color-foreground)]">{item.service_name}</td>
                  <td className="px-4 py-2.5 text-xs capitalize text-[var(--color-muted-fg)]">{item.priority}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{item.sample_type ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {item.result ? (
                      <span className={item.is_abnormal ? "font-semibold text-red-600" : "font-medium text-[var(--color-foreground)]"}>
                        {item.result}
                        {item.result_unit ? ` ${item.result_unit}` : ""}
                        {item.is_abnormal ? " ⚠" : ""}
                      </span>
                    ) : (
                      <span className={mutedFg}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canWork && canEnterResults && !request.is_external && ["sample_collected", "in_progress"].includes(request.status) && (
          <div className="rounded-xl border border-[var(--color-border)] bg-slate-50/60 p-4">
            <p className={cardTitle}>Enter lab results</p>
            <p className={mutedXsMt}>
              Fill in the result of each test below — sending will mark the request completed and mail the results to the requesting staff with the patient in copy.
            </p>
            <div className="mt-3 space-y-3">
              {request.lab_request_items.map((item) => {
                const draft = resultDraft[item.id] ?? { result: "", unit: "", isAbnormal: false };
                return (
                  <div key={item.id} className="rounded-lg border border-[var(--color-border)] bg-white p-3">
                    <p className="text-sm font-medium text-[var(--color-foreground)]">{item.service_name}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        placeholder="Result value (e.g. 12.5)"
                        value={draft.result}
                        onChange={(e) =>
                          setResultDraft({ ...resultDraft, [item.id]: { ...draft, result: e.target.value } })
                        }
                        className={`${inputCls} max-w-[180px] !py-1.5 text-xs`}
                      />
                      <input
                        type="text"
                        placeholder="Unit (e.g. g/dL)"
                        value={draft.unit}
                        onChange={(e) =>
                          setResultDraft({ ...resultDraft, [item.id]: { ...draft, unit: e.target.value } })
                        }
                        className={`${inputCls} w-28 !py-1.5 text-xs`}
                      />
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-[var(--color-foreground)]">
                        <input
                          type="checkbox"
                          checked={draft.isAbnormal}
                          onChange={(e) =>
                            setResultDraft({ ...resultDraft, [item.id]: { ...draft, isAbnormal: e.target.checked } })
                          }
                          className="h-3.5 w-3.5 accent-red-600"
                        />
                        Abnormal
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={reportResults}
              disabled={busy}
              className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
            >
              {busy ? "Sending…" : "Report results & notify doctor + patient"}
            </button>
          </div>
        )}

        {canWork && canEnterResults && (
          <button
            type="button"
            onClick={() => {
              if (!confirm("Mark this request as completed?")) return;
              updateStatus("completed");
            }}
            disabled={busy}
            className="focus-ring w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Mark completed"}
          </button>
        )}
      </div>

      {showSchedule && (
        <ScheduleAppointmentModal
          patient={request.patients}
          servicesSummary={request.lab_request_items.map((t) => t.service_name).join(", ")}
          onClose={() => setShowSchedule(false)}
          onScheduled={() => setShowSchedule(false)}
        />
      )}
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// SCHEDULE APPOINTMENT MODAL — book a collection appointment for the request's
// patient (or dependant) via /api/appointments
// ---------------------------------------------------------------------------
function ScheduleAppointmentModal({
  patient,
  servicesSummary,
  onClose,
  onScheduled,
}: {
  patient: LabRequest["patients"];
  servicesSummary: string;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<{ id: string; label: string }[]>([]);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/staff?pageSize=100", { cache: "no-store" });
        const body = await res.json();
        setDoctors(
          (body.data ?? [])
            .filter((s: { users?: { role?: string } }) => !!s.users?.role && ["hospital_admin", "nurse", ...CLINICIAN_ROLES].includes(s.users.role as (typeof CLINICIAN_ROLES)[number]))
            .map((s: { id: string; users?: { id?: string; full_name?: string } }) => ({
              id: s.users?.id ?? s.id,
              label: s.users?.full_name ?? "Doctor",
            }))
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
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: patient?.id,
          doctorId: (form.get("doctorId") as string) || undefined,
          scheduledDate: form.get("date"),
          startTime: form.get("startTime"),
          endTime: (form.get("endTime") as string) || undefined,
          type: form.get("type") || "in_person",
          reason: `Sample collection — ${servicesSummary}`,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to schedule appointment");
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to schedule appointment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Schedule sample collection" onClose={onClose}>
      {success ? (
        <div className="mt-5 space-y-4">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            Appointment scheduled. The patient&apos;s portal account has been notified.
          </p>
          <button type="button" onClick={onClose} className="focus-ring w-full rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]">
            Done
          </button>
        </div>
      ) : (
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(new FormData(e.currentTarget));
          }}
        >
          <div>
            <label className={labelCls}>Patient</label>
            <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2.5 text-sm font-medium text-[var(--color-foreground)]">
              {patient ? `${patient.first_name} ${patient.last_name} (${patient.patient_number})` : "Unknown"}
            </p>
            <p className="mt-1.5 text-xs text-[var(--color-muted-fg)]">{servicesSummary}</p>
          </div>

          <div>
            <label className={labelCls} htmlFor="sch-doctor">Doctor (optional)</label>
            <select id="sch-doctor" name="doctorId" className={inputCls}>
              <option value="">No doctor assigned</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="sch-date">Date</label>
              <input
                id="sch-date"
                name="date"
                type="date"
                required
                min={new Date().toISOString().split("T")[0]}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="sch-type">Type</label>
              <select id="sch-type" name="type" className={inputCls} defaultValue="in_person">
                <option value="in_person">In person</option>
                <option value="home_visit">Home visit</option>
                <option value="follow_up">Follow up</option>
                <option value="video_call">Video call</option>
                <option value="telephone">Telephone</option>
                <option value="telemedicine">Telemedicine</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="sch-start">Start time</label>
              <input id="sch-start" name="startTime" type="time" required className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="sch-end">End time (optional)</label>
              <input id="sch-end" name="endTime" type="time" className={inputCls} />
            </div>
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
              {busy ? "Scheduling…" : "Schedule appointment"}
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}