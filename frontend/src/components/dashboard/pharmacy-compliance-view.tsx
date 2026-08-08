"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ShieldAlert, ScrollText, BarChart3, Syringe, Check, X, Search, Download, Activity,
} from "lucide-react";

// ============================================================================
// Pharmacy Compliance — NAFDAC controlled-drug register, hash-chained
// dispensing audit, regulatory alerts and statutory report exports.
// ============================================================================

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const btnPrimary =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60";
const btnGhost =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-slate-50 disabled:opacity-60";
const ngn = (v: number | null | undefined) => `₦${Number(v ?? 0).toLocaleString()}`;
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

type Tab = "alerts" | "register" | "audit" | "dispense" | "reports";

const TABS: Array<{ id: Tab; label: string; icon: typeof AlertTriangle }> = [
  { id: "alerts", label: "Alerts", icon: AlertTriangle },
  { id: "register", label: "Controlled register", icon: ScrollText },
  { id: "audit", label: "Audit trail", icon: ShieldAlert },
  { id: "dispense", label: "Dispense", icon: Syringe },
  { id: "reports", label: "NAFDAC reports", icon: BarChart3 },
];

interface AlertRow {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  status: string;
  created_at: string;
  pharmacy_drugs: { name: string; control_schedule: string | null; nafdac_number: string | null } | null;
}

interface RegRow {
  id: string;
  drug_id: string;
  patient_id: string | null;
  prescription_id: string | null;
  quantity_dispensed: number;
  quantity_received: number;
  balance_after: number;
  prescriber_name: string | null;
  notes: string | null;
  created_at: string;
  pharmacy_drugs: { name: string; control_schedule: string | null } | null;
  patients: { patient_number: string; first_name: string; last_name: string } | null;
  users: { full_name: string } | null;
}

interface LogRow {
  id: number;
  action: string;
  drug_name: string;
  quantity: number;
  batch_id: string | null;
  patient_id: string | null;
  prescription_id: string | null;
  notes: string | null;
  hash: string;
  prev_hash: string | null;
  created_at: string;
  users: { full_name: string } | null;
}

interface DrugRow {
  id: string;
  name: string;
  nafdac_number: string | null;
  control_schedule: string | null;
  max_qty_per_dispense: number | null;
  reorder_level: number;
  on_hand: number;
  register_balance: number | null;
  low: boolean;
}

const sevStyle = (s: string) =>
  s === "critical"
    ? "bg-red-50 text-red-700 ring-1 ring-red-200"
    : s === "warning"
      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
      : "bg-sky-50 text-sky-700 ring-1 ring-sky-200";

export default function PharmacyComplianceView() {
  const [tab, setTab] = useState<Tab>("alerts");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-foreground)]">Pharmacy compliance</h2>
          <p className="mt-0.5 text-sm text-[var(--color-muted-fg)]">
            NAFDAC control register, tamper-proof audit trail, regulatory alerts and stat reports.
          </p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Compliance section">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors duration-200 ${
                tab === t.id ? "bg-[var(--color-primary)] text-white" : "border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-slate-50"
              }`}
            >
              <t.icon size={14} aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "alerts" && <AlertsTab />}
      {tab === "register" && <RegisterTab />}
      {tab === "audit" && <AuditTab />}
      {tab === "dispense" && <DispenseTab />}
      {tab === "reports" && <ReportsTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------
function AlertsTab() {
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [status, setStatus] = useState("open");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const load = useCallback(async (stat = status) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pharmacy/compliance/alerts?pageSize=100${stat ? `&status=${stat}` : ""}`, { cache: "no-store" });
      const j = await res.json();
      setRows(j.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const resolve = async (a: AlertRow, st: "acknowledged" | "resolved") => {
    const res = await fetch("/api/pharmacy/compliance/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, status: st }),
    });
    if (!res.ok) { setMsg((await res.json()).error ?? "Failed"); return; }
    void load();
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[var(--color-foreground)]">Regulatory alerts</h3>
          <p className="text-xs text-[var(--color-muted-fg)]">Low controlled stock, expiring stock, invalid registration and suspicious dispensing patterns.</p>
        </div>
        <div className="flex gap-1">
          {["open", "acknowledged", "resolved", ""].map((s) => (
            <button key={s || "all"} type="button" onClick={() => setStatus(s)}
              className={`focus-ring rounded-lg px-2.5 py-1.5 text-xs font-semibold ${status === s ? "bg-[var(--color-primary)] text-white" : "border border-[var(--color-border)] text-[var(--color-muted-fg)]"}`}>
              {s || "all"}
            </button>
          ))}
        </div>
      </div>
      {msg && <p className="mb-3 text-sm text-red-600">{msg}</p>}
      {loading ? <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading alerts…</p> : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">No alerts match this filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
              <tr>
                <th className="py-2 pr-3 font-semibold">Type</th>
                <th className="py-2 pr-3 font-semibold">Drug</th>
                <th className="py-2 pr-3 font-semibold">Severity</th>
                <th className="py-2 pr-3 font-semibold">Message</th>
                <th className="py-2 pr-3 font-semibold">Raised</th>
                <th className="py-2 font-semibold">Status</th>
                <th className="py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="py-2.5 pr-3 font-medium text-[var(--color-foreground)]">{a.alert_type}</td>
                  <td className="py-2.5 pr-3 text-[var(--color-muted-fg)]">{a.pharmacy_drugs?.name ?? "—"}</td>
                  <td className="py-2.5 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sevStyle(a.severity)}`}>{a.severity}</span></td>
                  <td className="py-2.5 pr-3 text-[var(--color-muted-fg)]">{a.message}</td>
                  <td className="py-2.5 pr-3 text-xs text-[var(--color-muted-fg)]">{fmt(a.created_at)}</td>
                  <td className="py-2.5 pr-3 text-xs text-[var(--color-muted-fg)]">{a.status}</td>
                  <td className="py-2.5">
                    <div className="flex gap-1.5">
                      {a.status === "open" && (
                        <button type="button" onClick={() => void resolve(a, "acknowledged")} className={btnGhost}>Acknowledge</button>
                      )}
                      {a.status !== "resolved" && (
                        <button type="button" onClick={() => void resolve(a, "resolved")} className={btnPrimary}><Check size={12} />Resolve</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controlled register
// ---------------------------------------------------------------------------
function RegisterTab() {
  const [rows, setRows] = useState<RegRow[]>([]);
  const [drugs, setDrugs] = useState<DrugRow[]>([]);
  const [drugId, setDrugId] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (did = drugId) => {
    setLoading(true);
    try {
      const [rRes, dRes] = await Promise.all([
        fetch(`/api/pharmacy/compliance/register?pageSize=200${did ? `&drugId=${did}` : ""}`, { cache: "no-store" }),
        fetch("/api/pharmacy/controlled-drugs", { cache: "no-store" }),
      ]);
      const r = await rRes.json();
      const d = await dRes.json();
      setRows(r.data ?? []);
      setDrugs(d.data ?? []);
    } catch { /* noop */ } finally { setLoading(false); }
  }, [drugId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[var(--color-foreground)]">Controlled drug register</h3>
          <p className="text-xs text-[var(--color-muted-fg)]">Append-only ledger — every controlled movement with running balance. Corrections are new rows.</p>
        </div>
        <select className={inputCls + " w-auto"} value={drugId} onChange={(e) => setDrugId(e.target.value)}>
          <option value="">All controlled drugs</option>
          {drugs.map((d) => (
            <option key={d.id} value={d.id}>{d.name} {d.low && "· LOW"}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading register…</p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">No register entries yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
              <tr>
                <th className="py-2 pr-3 font-semibold">When</th>
                <th className="py-2 pr-3 font-semibold">Drug</th>
                <th className="py-2 pr-3 font-semibold">Patient</th>
                <th className="py-2 pr-3 font-semibold">In</th>
                <th className="py-2 pr-3 font-semibold">Out</th>
                <th className="py-2 pr-3 font-semibold">Balance</th>
                <th className="py-2 pr-3 font-semibold">Prescriber</th>
                <th className="py-2 font-semibold">Logged by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2.5 pr-3 text-xs text-[var(--color-muted-fg)]">{fmt(r.created_at)}</td>
                  <td className="py-2.5 pr-3">{r.pharmacy_drugs?.name ?? "—"}</td>
                  <td className="py-2.5 pr-3 text-[var(--color-muted-fg)]">
                    {r.patients ? `${r.patients.first_name} ${r.patients.last_name}` : r.prescription_id ? "(Rx)" : "—"}
                  </td>
                  <td className="py-2.5 pr-3 text-emerald-600">{r.quantity_received || "—"}</td>
                  <td className="py-2.5 pr-3 text-red-600">{r.quantity_dispensed || "—"}</td>
                  <td className="py-2.5 pr-3 font-semibold text-[var(--color-foreground)]">{r.balance_after}</td>
                  <td className="py-2.5 pr-3 text-[var(--color-muted-fg)]">{r.prescriber_name ?? "—"}</td>
                  <td className="py-2.5 text-[var(--color-muted-fg)]">{r.users?.full_name ?? "system"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit trail (hash-chained)
// ---------------------------------------------------------------------------
function AuditTab() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [verified, setVerified] = useState<{ verified: boolean; brokenAt: number | null; total: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pharmacy/compliance/logs?pageSize=200", { cache: "no-store" });
      const j = await res.json();
      setRows(j.data?.rows ?? []);
    } catch { setRows([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const verifyChain = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/pharmacy/compliance/logs?pageSize=1&verify=true", { cache: "no-store" });
      const j = await res.json();
      setVerified(j.data?.verified ?? null);
    } catch { setVerified(null); } finally { setChecking(false); }
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[var(--color-foreground)]">H dispensing audit trail</h3>
          <p className="text-xs text-[var(--color-muted-fg)]">Every stock movement is appended with a linked SHA-256 hash. Rows cannot be edited or deleted.</p>
        </div>
        <button type="button" onClick={() => void verifyChain()} disabled={checking} className={btnGhost}>
          {checking ? "Verifying…" : <><ShieldAlert size={13} />Verify full chain</>}
        </button>
      </div>
      {verified && (
        <div className={`mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${verified.verified ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {verified.verified ? <><Check size={15} /> {verified.total.toLocaleString()} audit rows — hash chain verified unbroken</> : <><X size={15} /> Chain BROKEN at row {verified.brokenAt} — audit tampering possible</>}
        </div>
      )}
      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading audit trail…</p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">No movements logged yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
              <tr>
                <th className="py-2 pr-3 font-semibold">#</th>
                <th className="py-2 pr-3 font-semibold">When</th>
                <th className="py-2 pr-3 font-semibold">Action</th>
                <th className="py-2 pr-3 font-semibold">Drug</th>
                <th className="py-2 pr-3 font-semibold">Qty</th>
                <th className="py-2 pr-3 font-semibold">Actor</th>
                <th className="py-2 font-semibold">Hash (truncated)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2.5 pr-3 text-xs text-[var(--color-muted-fg)]">#{r.id}</td>
                  <td className="py-2.5 pr-3 text-xs text-[var(--color-muted-fg)]">{fmt(r.created_at)}</td>
                  <td className="py-2.5 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.action === "in" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>{r.action}</span></td>
                  <td className="py-2.5 pr-3">{r.drug_name}</td>
                  <td className="py-2.5 pr-3">{r.quantity}</td>
                  <td className="py-2.5 pr-3 text-[var(--color-muted-fg)]">{r.users?.full_name ?? "system"}</td>
                  <td className="py-2.5 font-mono text-xs text-[var(--color-muted-fg)]" title={r.hash}>{r.hash.slice(0, 16)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controlled dispensing
// ---------------------------------------------------------------------------
function DispenseTab() {
  const [drugs, setDrugs] = useState<DrugRow[]>([]);
  const [drugId, setDrugId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [patients, setPatients] = useState<Array<{ id: string; first_name: string; last_name: string; patient_number: string }>>([]);
  const [qSearch, setQSearch] = useState("");
  const [rxs, setRxs] = useState<Array<{ id: string; status: string; issued_date: string; prescription_items: Array<{ id: string; pharmacy_drug_id: string | null; medication_name: string; quantity: number; dispensed_qty: number }> }>>([]);
  const [rxId, setRxId] = useState("");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [lastDispense, setLastDispense] = useState<{ drug: string; qty: number; at: string } | null>(null);

  useEffect(() => {
    fetch("/api/pharmacy/controlled-drugs", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setDrugs(j.data ?? []))
      .catch(() => setDrugs([]));
  }, []);

  const searchPatients = async () => {
    if (!qSearch.trim()) return;
    const res = await fetch(`/api/patients?q=${encodeURIComponent(qSearch.trim())}&pageSize=20`, { cache: "no-store" });
    const j = await res.json();
    setPatients(j.data ?? []);
  };

  const pickPatient = async (id: string) => {
    setPatientId(id);
    const res = await fetch(`/api/prescriptions?patient_id=${id}&status=active`, { cache: "no-store" });
    const j = await res.json();
    setRxs(j.data ?? []);
  };

  const drug = drugs.find((d) => d.id === drugId);

  const dispense = async () => {
    setMsg(null);
    if (!drugId || !rxId || !patientId || !(Number(qty) > 0)) {
      setMsg({ ok: false, text: "Drug, prescription, patient and a positive quantity are required." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/pharmacy/controlled-dispense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drugId, prescriptionId: rxId, patientId, quantity: Number(qty), notes }),
      });
      const j = await res.json();
      if (!res.ok) { setMsg({ ok: false, text: j.error ?? "Dispense failed" }); return; }
      setMsg({ ok: true, text: `Dispensed. ${j.data?.dispensed ?? 0} movement row(s) written.` });
      setLastDispense({ drug: drug?.name ?? drugId, qty: Number(qty), at: new Date().toLocaleString() });
      const fresh = await fetch("/api/pharmacy/controlled-drugs", { cache: "no-store" });
      setDrugs((await fresh.json()).data ?? []);
    } catch {
      setMsg({ ok: false, text: "Dispense request failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
        <h3 className="font-semibold text-[var(--color-foreground)]">Prescribed controlled doses</h3>
        <p className="mb-4 text-xs text-[var(--color-muted-fg)]">Enforced: NAFDAC registration, Rx must be active and match the patient, per-dispense cap, and auto-logs the chain.</p>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Controlled drug</label>
        <select className={inputCls} value={drugId} onChange={(e) => setDrugId(e.target.value)}>
          <option value="">Select drug…</option>
          {drugs.map((d) => (
            <option key={d.id} value={d.id} disabled={d.on_hand <= 0}>
              {d.name} · {d.control_schedule} · on hand {d.on_hand}{d.register_balance != null ? ` · register ${d.register_balance}` : ""}
            </option>
          ))}
        </select>
        {drug && (
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[var(--color-muted-fg)]">NAFDAC {drug.nafdac_number ?? "—"}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[var(--color-muted-fg)]">cap {drug.max_qty_per_dispense ?? "—"}/dispense</span>
            <span className={drug.low ? "rounded-full bg-red-50 px-2 py-0.5 text-red-700" : "rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700"}>
              {drug.low ? "LOW STOCK" : `on hand ${drug.on_hand}`}
            </span>
          </div>
        )}

        <label className="mb-1 mt-4 block text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Patient</label>
        <div className="flex gap-2">
          <input className={inputCls} placeholder="Search patient (name or no)…" value={qSearch} onChange={(e) => setQSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void searchPatients()} />
          <button type="button" onClick={() => void searchPatients()} className={btnGhost}><Search size={14} />Find</button>
        </div>
        {patients.length > 0 && (
          <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-[var(--color-border)]">
            {patients.map((p) => (
              <li key={p.id}>
                <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => void pickPatient(p.id)}>
                  {p.first_name} {p.last_name} <span className="text-xs text-[var(--color-muted-fg)]">#{p.patient_number}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="mb-1 mt-4 block text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Prescription</label>
        <select className={inputCls} value={rxId} onChange={(e) => setRxId(e.target.value)}>
          <option value="">Select active Rx…</option>
          {rxs.map((rx) => (
            <option key={rx.id} value={rx.id}>Rx {rx.id.slice(0, 8)} · {rx.issued_date} · {rx.prescription_items?.length ?? 0} item(s)</option>
          ))}
        </select>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Quantity</label>
            <input type="number" min={1} className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Notes</label>
            <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
          </div>
        </div>

        <button type="button" onClick={() => void dispense()} disabled={busy} className={btnPrimary + " mt-4 w-full justify-center py-2.5"}>
          <Syringe size={14} />{busy ? "Dispensing…" : "Dispense controlled dose"}
        </button>
        {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>}
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
        <h3 className="mb-3 font-semibold text-[var(--color-foreground)]">Controlled formulary health</h3>
        {lastDispense && (
          <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Last dispensed: {lastDispense.drug} ×{lastDispense.qty} at {lastDispense.at}
          </div>
        )}
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-[var(--color-border)] bg-white text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
              <tr>
                <th className="py-2 pr-3 font-semibold">Drug</th>
                <th className="py-2 pr-3 font-semibold">Schedule</th>
                <th className="py-2 pr-3 font-semibold">NAFDAC</th>
                <th className="py-2 pr-3 font-semibold">On hand</th>
                <th className="py-2 font-semibold">Register</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {drugs.map((d) => (
                <tr key={d.id} className={d.low ? "bg-red-50" : undefined}>
                  <td className="py-2.5 pr-3">{d.name}</td>
                  <td className="py-2.5 pr-3 text-xs text-[var(--color-muted-fg)]">{d.control_schedule ?? "—"}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-[var(--color-muted-fg)]">{d.nafdac_number ?? "—"}</td>
                  <td className="py-2.5 pr-3 font-semibold">{d.on_hand}{d.low ? " ⚠" : ""}</td>
                  <td className="py-2.5 text-[var(--color-muted-fg)]">{d.register_balance ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NAFDAC reports
// ---------------------------------------------------------------------------
interface ReportRow {
  [key: string]: unknown;
}

function ReportsTab() {
  const [report, setReport] = useState<"usage" | "movements" | "expiry" | "supplier">("usage");
  const [from, setFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [days, setDays] = useState(90);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const run = async () => {
    setLoading(true);
    setMsg("");
    try {
      const params = new URLSearchParams({ report, from, to, days: String(days), includeExpired: "true" });
      if (report === "usage" || report === "movements") params.set("includeExpired", "false");
      const res = await fetch(`/api/pharmacy/compliance/reports?${params}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) { setMsg(j.error ?? "Report failed"); setRows([]); return; }
      setRows(j.data?.rows ?? []);
    } catch {
      setMsg("Report request failed");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void run(); }, []);

  const exportCsv = () => {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]).join(",");
    const lines = rows.map((r) => Object.values(r).map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([`${headers}\n${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `compliance-${report}-${from}-to-${to}.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    document.body.removeChild(a);
  };

  const columns = useMemo(() => (rows.length ? Object.keys(rows[0]) : []), [rows]);

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="font-semibold text-[var(--color-foreground)]">NAFDAC statutory reports</h3>
        <div className="ml-auto flex flex-wrap gap-2">
          {(["usage", "movements", "expiry", "supplier"] as const).map((r) => (
            <button key={r} type="button" onClick={() => setReport(r)}
              className={`focus-ring rounded-lg px-2.5 py-1.5 text-xs font-semibold ${report === r ? "bg-[var(--color-primary)] text-white" : "border border-[var(--color-border)] text-[var(--color-muted-fg)]"}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs"><span className="mb-1 block font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">From</span><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs"><span className="mb-1 block font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">To</span><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {report === "expiry" && (
          <label className="text-xs"><span className="mb-1 block font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Window (days)</span><input type="number" min={1} className={inputCls + " w-24"} value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
        )}
        <button type="button" onClick={() => void run()} disabled={loading} className={btnPrimary}>{loading ? "Loading…" : <><Activity size={14} />Run report</>}</button>
        <button type="button" onClick={exportCsv} disabled={rows.length === 0} className={btnGhost}><Download size={14} />Export CSV</button>
      </div>
      {msg && <p className="mb-3 text-sm text-red-600">{msg}</p>}
      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Running {report} report…</p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">No rows for this report / window.</p>
      ) : (
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-[var(--color-border)] bg-white text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
              <tr>{columns.map((c) => <th key={c} className="py-2 pr-3 font-semibold">{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((r, i) => (
                <tr key={i}>{columns.map((c) => <td key={c} className="py-2 pr-3 text-[var(--color-muted-fg)]">{String(r[c] ?? "—")}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}