"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  ShieldPlus,
  Trash2,
} from "lucide-react";
import BranchFilter from "@/components/dashboard/branch-filter";
import { useBranch } from "@/lib/branch-context";
import { formatCurrency, useCurrency } from "@/lib/currency";
import { dateStamp, downloadCsv } from "@/lib/export";
import {
  emptyState,
  errorBanner,
  flexBetween,
  flexGap2,
  flexWrapGap2,
  mutedFg,
  mutedSm,
  mutedSmPlain,
  pageTitle,
  sectionTitle,
  tableHeadCell,
  divideBorder,
  ghostIconBtn,
  modalBackdrop,
} from "@/lib/ui-constants";

const inputCls =
  "w-full rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2.5 text-sm outline-none transition-all duration-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/15";
const selectCls =
  "w-full rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2.5 text-sm outline-none transition-all duration-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/15";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

const SERVICE_TYPES = ["consultation", "lab_test", "procedure", "drug", "ward", "maternity", "emergency", "diagnostic", "other"] as const;
const COVERAGE_TYPES = ["full", "partial", "co_pay"] as const;

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function statusBadge(status: string, map: Record<string, string>) {
  const cls = map[status] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

const CLAIM_STATUS_CLS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  pending: "bg-amber-100 text-amber-700",
  submitted: "bg-sky-100 text-sky-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  paid: "bg-emerald-100 text-emerald-700",
};

const TYPE_CLS: Record<string, string> = {
  nhia: "bg-indigo-100 text-indigo-700",
  hmo: "bg-sky-100 text-sky-700",
  private: "bg-violet-100 text-violet-700",
};

/* ──────────────────────────── TYPES ──────────────────────────── */
interface Provider {
  id: string;
  name: string;
  code: string | null;
  provider_type: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  payment_terms: string | null;
  is_active: boolean;
  created_at: string;
}

interface Policy {
  id: string;
  patient_id: string;
  provider_id: string;
  policy_number: string;
  plan_name: string;
  coverage_type: string;
  copay_percent: number | null;
  effective_date: string;
  expiry_date: string | null;
  status: string;
  patients: { first_name: string; last_name: string; patient_number: string } | null;
  insurance_providers: { name: string; code: string | null } | null;
}

interface Coverage {
  id: string;
  provider_id: string;
  service_type: string;
  tariff_code: string | null;
  tariff_name: string | null;
  coverage_percent: number;
  copay_amount: number | null;
  requires_auth: boolean;
  is_active: boolean;
  insurance_providers: { name: string } | null;
}

interface Claim {
  id: string;
  claim_number: string;
  patient_id: string;
  provider_id: string;
  invoice_id: string | null;
  encounter_type: string | null;
  encounter_date: string | null;
  billed_amount: number;
  covered_amount: number;
  copay_amount: number;
  status: string;
  submitted_at: string | null;
  patients: { first_name: string; last_name: string; patient_number: string } | null;
  insurance_providers: { name: string } | null;
}

interface Authorization {
  id: string;
  patient_id: string;
  provider_id: string;
  service_description: string;
  estimated_amount: number;
  status: string;
  valid_until: string | null;
  patients: { first_name: string; last_name: string; patient_number: string } | null;
  insurance_providers: { name: string } | null;
}

type TabKey = "providers" | "policies" | "coverage" | "claims" | "auth" | "reports";

/* ──────────────────────────── COMPONENT ──────────────────────────── */
export default function InsuranceView() {
  const { currency } = useCurrency();
  const { selectedBranchId } = useBranch();
  const fmt = useCallback((n: number | null | undefined) => formatCurrency(n ?? 0, currency), [currency]);

  const [tab, setTab] = useState<TabKey>("providers");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  /* ── Providers ── */
  const [providers, setProviders] = useState<Provider[]>([]);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [editProvider, setEditProvider] = useState<Provider | null>(null);
  const [providerForm, setProviderForm] = useState({ name: "", code: "", provider_type: "hmo", contact_person: "", phone: "", email: "", address: "", payment_terms: "" });

  /* ── Policies ── */
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [editPolicy, setEditPolicy] = useState<Policy | null>(null);
  const [policyForm, setPolicyForm] = useState({ patient_id: "", provider_id: "", policy_number: "", plan_name: "", coverage_type: "full", copay_percent: "", effective_date: "", expiry_date: "" });
  const [patientSearch, setPatientSearch] = useState("");
  const [patientOptions, setPatientOptions] = useState<{ id: string; label: string }[]>([]);

  /* ── Coverage ── */
  const [coverages, setCoverages] = useState<Coverage[]>([]);
  const [showCoverageModal, setShowCoverageModal] = useState(false);
  const [editCoverage, setEditCoverage] = useState<Coverage | null>(null);
  const [coverageForm, setCoverageForm] = useState({ provider_id: "", service_type: "consultation", tariff_code: "", tariff_name: "", coverage_percent: "80", copay_amount: "", requires_auth: false });

  /* ── Claims ── */
  const [claims, setClaims] = useState<Claim[]>([]);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [claimForm, setClaimForm] = useState({ patient_id: "", provider_id: "", invoice_id: "", encounter_type: "consultation", billed_amount: "", covered_amount: "", copay_amount: "" });
  const [bulkClaims, setBulkClaims] = useState<string[]>([]);

  /* ── Authorizations ── */
  const [auths, setAuths] = useState<Authorization[]>([]);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authForm, setAuthForm] = useState({ patient_id: "", provider_id: "", service_description: "", estimated_amount: "", valid_until: "" });

  /* ── Reports ── */
  const [reportSummary, setReportSummary] = useState({ total: 0, pending: 0, approved: 0, paid: 0, rejected: 0, pendingAmt: 0, approvedAmt: 0, paidAmt: 0, rejectedAmt: 0 });

  const [busy, setBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  /* ─── DATA LOADING ─── */
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const branchQs = selectedBranchId ? `&branch=${selectedBranchId}` : "";
      const [provRes, polRes, covRes, clmRes, authRes] = await Promise.all([
        fetch(`/api/insurance/providers?pageSize=500${branchQs}`, { cache: "no-store" }),
        fetch(`/api/insurance/policies?pageSize=500${branchQs}`, { cache: "no-store" }),
        fetch(`/api/insurance/coverage?pageSize=500${branchQs}`, { cache: "no-store" }),
        fetch(`/api/insurance/claims?pageSize=500${branchQs}`, { cache: "no-store" }),
        fetch(`/api/insurance/authorizations?pageSize=500${branchQs}`, { cache: "no-store" }),
      ]);
      const [provB, polB, covB, clmB, authB] = await Promise.all([
        provRes.ok ? provRes.json() : { data: [] },
        polRes.ok ? polRes.json() : { data: [] },
        covRes.ok ? covRes.json() : { data: [] },
        clmRes.ok ? clmRes.json() : { data: [] },
        authRes.ok ? authRes.json() : { data: [] },
      ]);
      setProviders(provB.data ?? []);
      setPolicies(polB.data ?? []);
      setCoverages(covB.data ?? []);
      setClaims(clmB.data ?? []);
      setAuths(authB.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load insurance data");
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ─── REPORTS COMPUTATION ─── */
  useEffect(() => {
    const total = claims.length;
    let pending = 0, approved = 0, paid = 0, rejected = 0;
    let pendingAmt = 0, approvedAmt = 0, paidAmt = 0, rejectedAmt = 0;
    for (const c of claims) {
      if (c.status === "pending" || c.status === "submitted") { pending++; pendingAmt += Number(c.covered_amount); }
      if (c.status === "approved") { approved++; approvedAmt += Number(c.covered_amount); }
      if (c.status === "paid") { paid++; paidAmt += Number(c.covered_amount); }
      if (c.status === "rejected") { rejected++; rejectedAmt += Number(c.billed_amount); }
    }
    setReportSummary({ total, pending, approved, paid, rejected, pendingAmt, approvedAmt, paidAmt, rejectedAmt });
  }, [claims]);

  /* ─── PATIENT SEARCH (for modals) ─── */
  useEffect(() => {
    if (!patientSearch.trim()) { setPatientOptions([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients?q=${encodeURIComponent(patientSearch)}&pageSize=20`, { cache: "no-store" });
        const body = await res.json();
        setPatientOptions(
          (body.data ?? []).map((p: { id: string; first_name: string; last_name: string; patient_number: string }) => ({
            id: p.id,
            label: `${p.first_name} ${p.last_name} (${p.patient_number})`,
          }))
        );
      } catch { /* non-critical */ }
    }, 300);
    return () => clearTimeout(t);
  }, [patientSearch]);

  /* ─── FILTERED DATA ─── */
  const filteredProviders = useMemo(() => {
    return providers.filter((p) => {
      const matchQ = !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.code ?? "").toLowerCase().includes(q.toLowerCase());
      const matchStatus = filterStatus === "all" || (filterStatus === "active" ? p.is_active : !p.is_active);
      return matchQ && matchStatus;
    });
  }, [providers, q, filterStatus]);

  const filteredPolicies = useMemo(() => {
    return policies.filter((p) => {
      const name = p.patients ? `${p.patients.first_name} ${p.patients.last_name}` : "";
      const matchQ = !q || name.toLowerCase().includes(q.toLowerCase()) || p.policy_number.toLowerCase().includes(q.toLowerCase()) || (p.plan_name ?? "").toLowerCase().includes(q.toLowerCase());
      const matchStatus = filterStatus === "all" || p.status === filterStatus;
      return matchQ && matchStatus;
    });
  }, [policies, q, filterStatus]);

  const filteredCoverages = useMemo(() => {
    return coverages.filter((c) => {
      const matchQ = !q || (c.tariff_name ?? "").toLowerCase().includes(q.toLowerCase()) || (c.tariff_code ?? "").toLowerCase().includes(q.toLowerCase()) || (c.insurance_providers?.name ?? "").toLowerCase().includes(q.toLowerCase());
      return matchQ;
    });
  }, [coverages, q]);

  const filteredClaims = useMemo(() => {
    return claims.filter((c) => {
      const name = c.patients ? `${c.patients.first_name} ${c.patients.last_name}` : "";
      const matchQ = !q || c.claim_number.toLowerCase().includes(q.toLowerCase()) || name.toLowerCase().includes(q.toLowerCase()) || (c.insurance_providers?.name ?? "").toLowerCase().includes(q.toLowerCase());
      const matchStatus = filterStatus === "all" || c.status === filterStatus;
      return matchQ && matchStatus;
    });
  }, [claims, q, filterStatus]);

  const filteredAuths = useMemo(() => {
    return auths.filter((a) => {
      const name = a.patients ? `${a.patients.first_name} ${a.patients.last_name}` : "";
      const matchQ = !q || name.toLowerCase().includes(q.toLowerCase()) || a.service_description.toLowerCase().includes(q.toLowerCase());
      const matchStatus = filterStatus === "all" || a.status === filterStatus;
      return matchQ && matchStatus;
    });
  }, [auths, q, filterStatus]);

  /* ─── PROVIDER CRUD ─── */
  async function saveProvider() {
    if (!providerForm.name.trim()) { setError("Provider name is required"); return; }
    setBusy(true);
    setError(null);
    setSaveMsg(null);
    try {
      const url = editProvider ? `/api/insurance/providers/${editProvider.id}` : "/api/insurance/providers";
      const method = editProvider ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(providerForm),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save provider");
      setShowProviderModal(false);
      setEditProvider(null);
      setSaveMsg(editProvider ? "Provider updated" : "Provider created");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save provider");
    } finally {
      setBusy(false);
    }
  }

  async function toggleProvider(p: Provider) {
    if (!confirm(`${p.is_active ? "Deactivate" : "Activate"} ${p.name}?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/insurance/providers/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !p.is_active }),
      });
      await loadAll();
    } catch { /* handled */ } finally { setBusy(false); }
  }

  async function deleteProvider(id: string) {
    if (!confirm("Delete this provider? Associated policies will need to be reassigned.")) return;
    setBusy(true);
    try {
      await fetch(`/api/insurance/providers/${id}`, { method: "DELETE" });
      await loadAll();
    } catch { /* handled */ } finally { setBusy(false); }
  }

  /* ─── POLICY CRUD ─── */
  async function savePolicy() {
    if (!policyForm.patient_id || !policyForm.provider_id || !policyForm.policy_number.trim()) {
      setError("Patient, provider, and policy number are required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url = editPolicy ? `/api/insurance/policies/${editPolicy.id}` : "/api/insurance/policies";
      const method = editPolicy ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...policyForm,
          copay_percent: policyForm.copay_percent ? Number(policyForm.copay_percent) : null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save policy");
      setShowPolicyModal(false);
      setEditPolicy(null);
      setSaveMsg(editPolicy ? "Policy updated" : "Policy created");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save policy");
    } finally {
      setBusy(false);
    }
  }

  async function togglePolicyStatus(p: Policy) {
    const next = p.status === "active" ? "suspended" : "active";
    if (!confirm(`${next === "suspended" ? "Suspend" : "Reinforce"} this policy?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/insurance/policies/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      await loadAll();
    } catch { /* handled */ } finally { setBusy(false); }
  }

  async function deletePolicy(id: string) {
    if (!confirm("Delete this policy?")) return;
    setBusy(true);
    try {
      await fetch(`/api/insurance/policies/${id}`, { method: "DELETE" });
      await loadAll();
    } catch { /* handled */ } finally { setBusy(false); }
  }

  /* ─── COVERAGE CRUD ─── */
  async function saveCoverage() {
    if (!coverageForm.provider_id || !coverageForm.tariff_name?.trim()) {
      setError("Provider and tariff name are required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url = editCoverage ? `/api/insurance/coverage/${editCoverage.id}` : "/api/insurance/coverage";
      const method = editCoverage ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...coverageForm,
          coverage_percent: Number(coverageForm.coverage_percent),
          copay_amount: coverageForm.copay_amount ? Number(coverageForm.copay_amount) : null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save coverage rule");
      setShowCoverageModal(false);
      setEditCoverage(null);
      setSaveMsg(editCoverage ? "Coverage rule updated" : "Coverage rule created");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save coverage rule");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCoverage(id: string) {
    if (!confirm("Delete this coverage rule?")) return;
    setBusy(true);
    try {
      await fetch(`/api/insurance/coverage/${id}`, { method: "DELETE" });
      await loadAll();
    } catch { /* handled */ } finally { setBusy(false); }
  }

  /* ─── CLAIM CRUD ─── */
  async function saveClaim() {
    if (!claimForm.patient_id || !claimForm.provider_id) {
      setError("Patient and provider are required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/insurance/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...claimForm,
          billed_amount: Number(claimForm.billed_amount),
          covered_amount: Number(claimForm.covered_amount),
          copay_amount: Number(claimForm.copay_amount),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create claim");
      setShowClaimModal(false);
      setSaveMsg("Claim created");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create claim");
    } finally {
      setBusy(false);
    }
  }

  async function updateClaimStatus(id: string, status: string) {
    setBusy(true);
    try {
      await fetch(`/api/insurance/claims/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setSelectedClaim(null);
      await loadAll();
    } catch { /* handled */ } finally { setBusy(false); }
  }

  async function bulkSubmitClaims() {
    if (bulkClaims.length === 0) return;
    if (!confirm(`Submit ${bulkClaims.length} claim(s)?`)) return;
    setBusy(true);
    try {
      await Promise.all(
        bulkClaims.map((id) =>
          fetch(`/api/insurance/claims/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "submitted" }),
          })
        )
      );
      setBulkClaims([]);
      await loadAll();
    } catch { /* handled */ } finally { setBusy(false); }
  }

  /* ─── AUTHORIZATION CRUD ─── */
  async function saveAuth() {
    if (!authForm.patient_id || !authForm.provider_id || !authForm.service_description.trim()) {
      setError("Patient, provider, and service description are required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/insurance/authorizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...authForm, estimated_amount: Number(authForm.estimated_amount) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create authorization");
      setShowAuthModal(false);
      setSaveMsg("Authorization created");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create authorization");
    } finally {
      setBusy(false);
    }
  }

  async function updateAuthStatus(id: string, status: string) {
    setBusy(true);
    try {
      await fetch(`/api/insurance/authorizations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await loadAll();
    } catch { /* handled */ } finally { setBusy(false); }
  }

  /* ─── EXPORT HELPERS ─── */
  const providerColumns = ["name", "code", "provider_type", "contact_person", "phone", "email", "payment_terms", "is_active"];
  function exportProviders() {
    if (filteredProviders.length === 0) { alert("Nothing to export"); return; }
    downloadCsv(`insurance-providers-${dateStamp()}.csv`, providerColumns, filteredProviders.map((p) => [p.name, p.code ?? "", p.provider_type, p.contact_person ?? "", p.phone ?? "", p.email ?? "", p.payment_terms ?? "", String(p.is_active)]));
  }

  const policyColumns = ["patient_name", "provider", "policy_number", "plan_name", "coverage_type", "copay_percent", "status", "effective_date", "expiry_date"];
  function exportPolicies() {
    if (filteredPolicies.length === 0) { alert("Nothing to export"); return; }
    downloadCsv(`insurance-policies-${dateStamp()}.csv`, policyColumns, filteredPolicies.map((p) => [
      p.patients ? `${p.patients.first_name} ${p.patients.last_name}` : "",
      p.insurance_providers?.name ?? "",
      p.policy_number, p.plan_name, p.coverage_type,
      String(p.copay_percent ?? ""), p.status, p.effective_date, p.expiry_date ?? "",
    ]));
  }

  const claimColumns = ["claim_number", "patient_name", "provider", "encounter_type", "encounter_date", "billed_amount", "covered_amount", "copay_amount", "status", "submitted_at"];
  function exportClaims() {
    if (filteredClaims.length === 0) { alert("Nothing to export"); return; }
    downloadCsv(`insurance-claims-${dateStamp()}.csv`, claimColumns, filteredClaims.map((c) => [
      c.claim_number,
      c.patients ? `${c.patients.first_name} ${c.patients.last_name}` : "",
      c.insurance_providers?.name ?? "",
      c.encounter_type ?? "", c.encounter_date ?? "",
      String(c.billed_amount), String(c.covered_amount), String(c.copay_amount),
      c.status, c.submitted_at ?? "",
    ]));
  }

  /* ──────────────────────────── RENDER ──────────────────────────── */
  const TABS: { key: TabKey; label: string }[] = [
    { key: "providers", label: "Providers" },
    { key: "policies", label: "Policies" },
    { key: "coverage", label: "Coverage" },
    { key: "claims", label: "Claims" },
    { key: "auth", label: "Authorizations" },
    { key: "reports", label: "Reports" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={pageTitle}>Insurance</h1>
          <p className={mutedSm}>Manage providers, policies, coverage rules, claims and pre-authorizations.</p>
        </div>
      </div>

      {error && <p role="alert" className={errorBanner}>{error}</p>}
      {saveMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          <Check size={14} /> {saveMsg}
          <button type="button" onClick={() => setSaveMsg(null)} className="ml-auto text-emerald-500 hover:text-emerald-700">✕</button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--color-border)] pb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setTab(t.key); setQ(""); setFilterStatus("all"); setError(null); setSaveMsg(null); }}
            className={`focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
              tab === t.key
                ? "bg-[var(--color-primary)] text-white"
                : "text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]/60 hover:text-[var(--color-foreground)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filter bar — only for non-reports tabs */}
      {tab !== "reports" && (
        <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <BranchFilter value={selectedBranchId} onChange={() => {}} hideWhenSingle />
            <div className="relative flex-1">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className={`${inputCls} pl-9`}
              />
            </div>
            <div className={flexWrapGap2}>
              {tab === "claims" && (
                <>
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Status</span>
                  {["all", "draft", "pending", "submitted", "approved", "rejected", "paid"].map((s) => (
                    <button key={s} type="button" onClick={() => setFilterStatus(s)}
                      className={`focus-ring rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors duration-200 ${filterStatus === s ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-muted)]/40 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"}`}>
                      {s === "all" ? "All" : s}
                    </button>
                  ))}
                </>
              )}
              {tab === "policies" && (
                <>
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Status</span>
                  {["all", "active", "suspended", "expired"].map((s) => (
                    <button key={s} type="button" onClick={() => setFilterStatus(s)}
                      className={`focus-ring rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors duration-200 ${filterStatus === s ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-muted)]/40 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"}`}>
                      {s === "all" ? "All" : s}
                    </button>
                  ))}
                </>
              )}
              {tab === "providers" && (
                <>
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Status</span>
                  {["all", "active", "inactive"].map((s) => (
                    <button key={s} type="button" onClick={() => setFilterStatus(s)}
                      className={`focus-ring rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors duration-200 ${filterStatus === s ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-muted)]/40 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"}`}>
                      {s === "all" ? "All" : s}
                    </button>
                  ))}
                </>
              )}
              {tab === "auth" && (
                <>
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Status</span>
                  {["all", "pending", "approved", "rejected"].map((s) => (
                    <button key={s} type="button" onClick={() => setFilterStatus(s)}
                      className={`focus-ring rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors duration-200 ${filterStatus === s ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-muted)]/40 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"}`}>
                      {s === "all" ? "All" : s}
                    </button>
                  ))}
                </>
              )}
              {tab === "providers" && (
                <button type="button" onClick={exportProviders} className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-muted-fg)] hover:bg-slate-50">Export CSV</button>
              )}
              {tab === "policies" && (
                <button type="button" onClick={exportPolicies} className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-muted-fg)] hover:bg-slate-50">Export CSV</button>
              )}
              {tab === "claims" && (
                <button type="button" onClick={exportClaims} className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-muted-fg)] hover:bg-slate-50">Export CSV</button>
              )}
              {(q || filterStatus !== "all") && (
                <button type="button" onClick={() => { setQ(""); setFilterStatus("all"); }} className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-muted-fg)] hover:bg-slate-50">Clear</button>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className={emptyState}>Loading insurance data…</p>
      ) : (
        <>
          {/* ═══════════════ PROVIDERS TAB ═══════════════ */}
          {tab === "providers" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className={mutedSmPlain}>{filteredProviders.length} provider(s)</p>
                <button type="button" onClick={() => { setEditProvider(null); setProviderForm({ name: "", code: "", provider_type: "hmo", contact_person: "", phone: "", email: "", address: "", payment_terms: "" }); setShowProviderModal(true); }}
                  className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]">
                  <Plus size={16} /> Add Provider
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
                <table className="w-full text-left text-sm">
                  <thead><tr className={tableHeadCell}>
                    <th className="px-4 py-2.5 font-semibold">Name</th>
                    <th className="px-4 py-2.5 font-semibold">Code</th>
                    <th className="px-4 py-2.5 font-semibold">Type</th>
                    <th className="px-4 py-2.5 font-semibold">Contact</th>
                    <th className="px-4 py-2.5 font-semibold">Payment Terms</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Actions</th>
                  </tr></thead>
                  <tbody className={divideBorder}>
                    {filteredProviders.map((p) => (
                      <tr key={p.id} className="hover:bg-[var(--color-muted)]/30">
                        <td className="px-4 py-2.5 font-medium">{p.name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-muted-fg)]">{p.code ?? "—"}</td>
                        <td className="px-4 py-2.5">{statusBadge(p.provider_type, TYPE_CLS)}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{p.contact_person ?? "—"}<br />{p.phone ? <a href={`tel:${p.phone}`} className="text-xs hover:underline">{p.phone}</a> : <span className="text-xs" />}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{p.payment_terms ?? "—"}</td>
                        <td className="px-4 py-2.5">{p.is_active ? <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Active</span> : <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Inactive</span>}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1.5">
                            <button type="button" onClick={() => { setEditProvider(p); setProviderForm({ name: p.name, code: p.code ?? "", provider_type: p.provider_type, contact_person: p.contact_person ?? "", phone: p.phone ?? "", email: p.email ?? "", address: p.address ?? "", payment_terms: p.payment_terms ?? "" }); setShowProviderModal(true); }}
                              className="focus-ring rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)] hover:text-[var(--color-primary)]"><Pencil size={14} /></button>
                            <button type="button" onClick={() => toggleProvider(p)} disabled={busy}
                              className="focus-ring rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-amber-50 hover:text-amber-600">{p.is_active ? "Deactivate" : "Activate"}</button>
                            <button type="button" onClick={() => deleteProvider(p.id)} disabled={busy}
                              className="focus-ring rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredProviders.length === 0 && (
                      <tr><td colSpan={7} className={emptyState}>No insurance providers found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════════ POLICIES TAB ═══════════════ */}
          {tab === "policies" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className={mutedSmPlain}>{filteredPolicies.length} policy(ies)</p>
                <button type="button" onClick={() => { setEditPolicy(null); setPolicyForm({ patient_id: "", provider_id: "", policy_number: "", plan_name: "", coverage_type: "full", copay_percent: "", effective_date: "", expiry_date: "" }); setPatientSearch(""); setShowPolicyModal(true); }}
                  className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]">
                  <Plus size={16} /> Add Policy
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
                <table className="w-full text-left text-sm">
                  <thead><tr className={tableHeadCell}>
                    <th className="px-4 py-2.5 font-semibold">Patient</th>
                    <th className="px-4 py-2.5 font-semibold">Provider</th>
                    <th className="px-4 py-2.5 font-semibold">Policy #</th>
                    <th className="px-4 py-2.5 font-semibold">Plan</th>
                    <th className="px-4 py-2.5 font-semibold">Coverage</th>
                    <th className="px-4 py-2.5 font-semibold">Co-pay %</th>
                    <th className="px-4 py-2.5 font-semibold">Expiry</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Actions</th>
                  </tr></thead>
                  <tbody className={divideBorder}>
                    {filteredPolicies.map((p) => (
                      <tr key={p.id} className="hover:bg-[var(--color-muted)]/30">
                        <td className="px-4 py-2.5 font-medium">{p.patients ? `${p.patients.first_name} ${p.patients.last_name}` : "—"}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{p.insurance_providers?.name ?? "—"}</td>
                        <td className="px-4 py-2.5 font-mono text-xs">{p.policy_number}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{p.plan_name ?? "—"}</td>
                        <td className="px-4 py-2.5">{statusBadge(p.coverage_type, { full: "bg-emerald-100 text-emerald-700", partial: "bg-sky-100 text-sky-700", co_pay: "bg-amber-100 text-amber-700" })}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{p.copay_percent != null ? `${p.copay_percent}%` : "—"}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{fmtDate(p.expiry_date)}</td>
                        <td className="px-4 py-2.5">{statusBadge(p.status, { active: "bg-emerald-100 text-emerald-700", suspended: "bg-amber-100 text-amber-700", expired: "bg-red-100 text-red-700" })}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1.5">
                            <button type="button" onClick={() => { setEditPolicy(p); setPolicyForm({ patient_id: p.patient_id, provider_id: p.provider_id, policy_number: p.policy_number, plan_name: p.plan_name ?? "", coverage_type: p.coverage_type, copay_percent: String(p.copay_percent ?? ""), effective_date: p.effective_date, expiry_date: p.expiry_date ?? "" }); setShowPolicyModal(true); }}
                              className="focus-ring rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)] hover:text-[var(--color-primary)]"><Pencil size={14} /></button>
                            <button type="button" onClick={() => togglePolicyStatus(p)} disabled={busy}
                              className="focus-ring rounded-lg p-1.5 text-xs font-medium text-[var(--color-muted-fg)] hover:bg-amber-50 hover:text-amber-600">{p.status === "active" ? "Suspend" : "Reinforce"}</button>
                            <button type="button" onClick={() => deletePolicy(p.id)} disabled={busy}
                              className="focus-ring rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredPolicies.length === 0 && (
                      <tr><td colSpan={9} className={emptyState}>No policies found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════════ COVERAGE TAB ═══════════════ */}
          {tab === "coverage" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className={mutedSmPlain}>{filteredCoverages.length} coverage rule(s)</p>
                <button type="button" onClick={() => { setEditCoverage(null); setCoverageForm({ provider_id: "", service_type: "consultation", tariff_code: "", tariff_name: "", coverage_percent: "80", copay_amount: "", requires_auth: false }); setShowCoverageModal(true); }}
                  className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]">
                  <Plus size={16} /> Add Rule
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
                <table className="w-full text-left text-sm">
                  <thead><tr className={tableHeadCell}>
                    <th className="px-4 py-2.5 font-semibold">Provider</th>
                    <th className="px-4 py-2.5 font-semibold">Service Type</th>
                    <th className="px-4 py-2.5 font-semibold">Tariff Code</th>
                    <th className="px-4 py-2.5 font-semibold">Tariff Name</th>
                    <th className="px-4 py-2.5 font-semibold">Coverage %</th>
                    <th className="px-4 py-2.5 font-semibold">Co-pay</th>
                    <th className="px-4 py-2.5 font-semibold">Auth</th>
                    <th className="px-4 py-2.5 font-semibold">Active</th>
                    <th className="px-4 py-2.5 font-semibold">Actions</th>
                  </tr></thead>
                  <tbody className={divideBorder}>
                    {filteredCoverages.map((c) => (
                      <tr key={c.id} className="hover:bg-[var(--color-muted)]/30">
                        <td className="px-4 py-2.5 font-medium">{c.insurance_providers?.name ?? "—"}</td>
                        <td className="px-4 py-2.5">{statusBadge(c.service_type, { consultation: "bg-sky-100 text-sky-700", lab_test: "bg-indigo-100 text-indigo-700", procedure: "bg-violet-100 text-violet-700", drug: "bg-emerald-100 text-emerald-700", ward: "bg-fuchsia-100 text-fuchsia-700", maternity: "bg-pink-100 text-pink-700", emergency: "bg-red-100 text-red-700", diagnostic: "bg-amber-100 text-amber-700", other: "bg-slate-100 text-slate-600" })}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-muted-fg)]">{c.tariff_code ?? "—"}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{c.tariff_name ?? "—"}</td>
                        <td className="px-4 py-2.5 font-semibold">{c.coverage_percent}%</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{c.copay_amount != null ? fmt(c.copay_amount) : "—"}</td>
                        <td className="px-4 py-2.5">{c.requires_auth ? <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Required</span> : <span className="text-[var(--color-muted-fg)]">No</span>}</td>
                        <td className="px-4 py-2.5">{c.is_active ? <span className="text-emerald-600 font-semibold">✓</span> : <span className="text-[var(--color-muted-fg)]">—</span>}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1.5">
                            <button type="button" onClick={() => { setEditCoverage(c); setCoverageForm({ provider_id: c.provider_id, service_type: c.service_type, tariff_code: c.tariff_code ?? "", tariff_name: c.tariff_name ?? "", coverage_percent: String(c.coverage_percent), copay_amount: String(c.copay_amount ?? ""), requires_auth: c.requires_auth }); setShowCoverageModal(true); }}
                              className="focus-ring rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)] hover:text-[var(--color-primary)]"><Pencil size={14} /></button>
                            <button type="button" onClick={() => deleteCoverage(c.id)} disabled={busy}
                              className="focus-ring rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredCoverages.length === 0 && (
                      <tr><td colSpan={9} className={emptyState}>No coverage rules found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════════ CLAIMS TAB ═══════════════ */}
          {tab === "claims" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className={mutedSmPlain}>{filteredClaims.length} claim(s)</p>
                <div className={flexGap2}>
                  {bulkClaims.length > 0 && (
                    <button type="button" onClick={bulkSubmitClaims} disabled={busy}
                      className="focus-ring inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-sky-700 disabled:opacity-60">
                      Submit {bulkClaims.length} draft(s)
                    </button>
                  )}
                  <button type="button" onClick={() => { setClaimForm({ patient_id: "", provider_id: "", invoice_id: "", encounter_type: "consultation", billed_amount: "", covered_amount: "", copay_amount: "" }); setShowClaimModal(true); }}
                    className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]">
                    <Plus size={16} /> Create Claim
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
                <table className="w-full text-left text-sm">
                  <thead><tr className={tableHeadCell}>
                    <th className="px-4 py-2.5 font-semibold"><input type="checkbox" onChange={(e) => {
                      const drafts = filteredClaims.filter((c) => c.status === "draft").map((c) => c.id);
                      setBulkClaims(e.target.checked ? drafts : []);
                    }} checked={bulkClaims.length > 0 && bulkClaims.length === filteredClaims.filter((c) => c.status === "draft").length} /></th>
                    <th className="px-4 py-2.5 font-semibold">Claim #</th>
                    <th className="px-4 py-2.5 font-semibold">Patient</th>
                    <th className="px-4 py-2.5 font-semibold">Provider</th>
                    <th className="px-4 py-2.5 font-semibold">Type</th>
                    <th className="px-4 py-2.5 font-semibold">Date</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Billed</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Covered</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Co-pay</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Actions</th>
                  </tr></thead>
                  <tbody className={divideBorder}>
                    {filteredClaims.map((c) => (
                      <tr key={c.id} className="hover:bg-[var(--color-muted)]/30">
                        <td className="px-4 py-2.5">
                          {c.status === "draft" && (
                            <input type="checkbox" checked={bulkClaims.includes(c.id)}
                              onChange={(e) => setBulkClaims((prev) => e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id))} />
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs font-semibold">{c.claim_number}</td>
                        <td className="px-4 py-2.5 font-medium">{c.patients ? `${c.patients.first_name} ${c.patients.last_name}` : "—"}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{c.insurance_providers?.name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{c.encounter_type ?? "—"}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{fmtDate(c.encounter_date)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">{fmt(c.billed_amount)}</td>
                        <td className="px-4 py-2.5 text-right text-emerald-600 font-semibold">{fmt(c.covered_amount)}</td>
                        <td className="px-4 py-2.5 text-right text-amber-600 font-semibold">{fmt(c.copay_amount)}</td>
                        <td className="px-4 py-2.5">{statusBadge(c.status, CLAIM_STATUS_CLS)}</td>
                        <td className="px-4 py-2.5">
                          <button type="button" onClick={() => setSelectedClaim(c)}
                            className="focus-ring rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)]">Detail</button>
                        </td>
                      </tr>
                    ))}
                    {filteredClaims.length === 0 && (
                      <tr><td colSpan={11} className={emptyState}>No claims found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════════ AUTHORIZATIONS TAB ═══════════════ */}
          {tab === "auth" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className={mutedSmPlain}>{filteredAuths.length} authorization(s)</p>
                <button type="button" onClick={() => { setAuthForm({ patient_id: "", provider_id: "", service_description: "", estimated_amount: "", valid_until: "" }); setShowAuthModal(true); }}
                  className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]">
                  <Plus size={16} /> New Authorization
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
                <table className="w-full text-left text-sm">
                  <thead><tr className={tableHeadCell}>
                    <th className="px-4 py-2.5 font-semibold">Patient</th>
                    <th className="px-4 py-2.5 font-semibold">Provider</th>
                    <th className="px-4 py-2.5 font-semibold">Service</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Estimated</th>
                    <th className="px-4 py-2.5 font-semibold">Valid Until</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Actions</th>
                  </tr></thead>
                  <tbody className={divideBorder}>
                    {filteredAuths.map((a) => (
                      <tr key={a.id} className="hover:bg-[var(--color-muted)]/30">
                        <td className="px-4 py-2.5 font-medium">{a.patients ? `${a.patients.first_name} ${a.patients.last_name}` : "—"}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{a.insurance_providers?.name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{a.service_description}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">{fmt(a.estimated_amount)}</td>
                        <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{fmtDate(a.valid_until)}</td>
                        <td className="px-4 py-2.5">{statusBadge(a.status, { pending: "bg-amber-100 text-amber-700", approved: "bg-emerald-100 text-emerald-700", rejected: "bg-red-100 text-red-700" })}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1.5">
                            {a.status === "pending" && (
                              <>
                                <button type="button" onClick={() => updateAuthStatus(a.id, "approved")} disabled={busy}
                                  className="focus-ring rounded-lg px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50">Approve</button>
                                <button type="button" onClick={() => updateAuthStatus(a.id, "rejected")} disabled={busy}
                                  className="focus-ring rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Reject</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredAuths.length === 0 && (
                      <tr><td colSpan={7} className={emptyState}>No pre-authorizations found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════════ REPORTS TAB ═══════════════ */}
          {tab === "reports" && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <SummaryCard label="Total Claims" value={String(reportSummary.total)} tone="sky" />
                <SummaryCard label="Pending" value={String(reportSummary.pending)} sub={fmt(reportSummary.pendingAmt)} tone="amber" />
                <SummaryCard label="Approved" value={String(reportSummary.approved)} sub={fmt(reportSummary.approvedAmt)} tone="emerald" />
                <SummaryCard label="Paid" value={String(reportSummary.paid)} sub={fmt(reportSummary.paidAmt)} tone="emerald" />
                <SummaryCard label="Rejected" value={String(reportSummary.rejected)} sub={fmt(reportSummary.rejectedAmt)} tone="rose" />
              </div>

              {/* Claims by Provider */}
              <div className="rounded-xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-sm)]">
                <h3 className={sectionTitle}>Claims by Provider</h3>
                {providers.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--color-muted-fg)]">No providers yet.</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {providers.map((prov) => {
                      const provClaims = claims.filter((c) => c.provider_id === prov.id);
                      if (provClaims.length === 0) return null;
                      const total = provClaims.length;
                      const paid = provClaims.filter((c) => c.status === "paid").length;
                      const pct = total > 0 ? (paid / total) * 100 : 0;
                      return (
                        <div key={prov.id}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="font-medium">{prov.name}</span>
                            <span className="text-[var(--color-muted-fg)]">{total} claim(s) · {paid} paid</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Denial Rate */}
              <div className="rounded-xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-sm)]">
                <h3 className={sectionTitle}>Performance Metrics</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl bg-[var(--color-muted)]/40 p-4 text-center">
                    <p className="text-2xl font-bold text-[var(--color-foreground)]">
                      {reportSummary.total > 0 ? Math.round((reportSummary.rejected / reportSummary.total) * 100) : 0}%
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-muted-fg)]">Denial Rate</p>
                  </div>
                  <div className="rounded-xl bg-[var(--color-muted)]/40 p-4 text-center">
                    <p className="text-2xl font-bold text-[var(--color-foreground)]">
                      {reportSummary.total > 0 ? Math.round((reportSummary.paid / reportSummary.total) * 100) : 0}%
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-muted-fg)]">Approval Rate</p>
                  </div>
                  <div className="rounded-xl bg-[var(--color-muted)]/40 p-4 text-center">
                    <p className="text-2xl font-bold text-[var(--color-foreground)]">
                      {reportSummary.total > 0 ? Math.round(((reportSummary.pending + reportSummary.approved + reportSummary.paid) / reportSummary.total) * 100) : 0}%
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-muted-fg)]">Processing Rate</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════ MODALS ═══════════════ */}
      {/* Provider modal */}
      {showProviderModal && (
        <ModalShell title={editProvider ? "Edit Provider" : "Add Provider"} onClose={() => { setShowProviderModal(false); setEditProvider(null); setError(null); }}>
          <form onSubmit={(e) => { e.preventDefault(); saveProvider(); }} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className={labelCls}>Name *</label><input value={providerForm.name} onChange={(e) => setProviderForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} required /></div>
              <div><label className={labelCls}>Code</label><input value={providerForm.code} onChange={(e) => setProviderForm((f) => ({ ...f, code: e.target.value }))} className={inputCls} placeholder="e.g. NHIA-001" /></div>
              <div><label className={labelCls}>Type</label>
                <select value={providerForm.provider_type} onChange={(e) => setProviderForm((f) => ({ ...f, provider_type: e.target.value }))} className={selectCls}>
                  <option value="nhia">NHIA</option><option value="hmo">HMO</option><option value="private">Private</option>
                </select>
              </div>
              <div><label className={labelCls}>Contact Person</label><input value={providerForm.contact_person} onChange={(e) => setProviderForm((f) => ({ ...f, contact_person: e.target.value }))} className={inputCls} /></div>
              <div><label className={labelCls}>Phone</label><input value={providerForm.phone} onChange={(e) => setProviderForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} /></div>
              <div><label className={labelCls}>Email</label><input type="email" value={providerForm.email} onChange={(e) => setProviderForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} /></div>
              <div className="sm:col-span-2"><label className={labelCls}>Address</label><input value={providerForm.address} onChange={(e) => setProviderForm((f) => ({ ...f, address: e.target.value }))} className={inputCls} /></div>
              <div className="sm:col-span-2"><label className={labelCls}>Payment Terms</label><input value={providerForm.payment_terms} onChange={(e) => setProviderForm((f) => ({ ...f, payment_terms: e.target.value }))} className={inputCls} placeholder="e.g. Net 30 days" /></div>
            </div>
            {error && <p role="alert" className={errorBanner}>{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => { setShowProviderModal(false); setEditProvider(null); setError(null); }} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={busy} className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* Policy modal */}
      {showPolicyModal && (
        <ModalShell title={editPolicy ? "Edit Policy" : "Add Policy"} onClose={() => { setShowPolicyModal(false); setEditPolicy(null); setError(null); }} wide>
          <form onSubmit={(e) => { e.preventDefault(); savePolicy(); }} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Patient *</label>
                {editPolicy ? (
                  <input readOnly value={policyForm.patient_id ? `${patientOptions.find((o) => o.id === policyForm.patient_id)?.label ?? policyForm.patient_id}` : ""} className={`${inputCls} bg-slate-50`} />
                ) : (
                  <>
                    <input value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} className={inputCls} placeholder="Search patient…" />
                    {patientOptions.length > 0 && (
                      <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white shadow-lg">
                        {patientOptions.map((o) => (
                          <button key={o.id} type="button" onClick={() => { setPolicyForm((f) => ({ ...f, patient_id: o.id })); setPatientSearch(o.label); setPatientOptions([]); }}
                            className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-[var(--color-muted)]">
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div>
                <label className={labelCls}>Provider *</label>
                <select value={policyForm.provider_id} onChange={(e) => setPolicyForm((f) => ({ ...f, provider_id: e.target.value }))} className={selectCls} required>
                  <option value="">Select provider…</option>
                  {providers.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
              </div>
              <div><label className={labelCls}>Policy Number *</label><input value={policyForm.policy_number} onChange={(e) => setPolicyForm((f) => ({ ...f, policy_number: e.target.value }))} className={inputCls} required /></div>
              <div><label className={labelCls}>Plan Name</label><input value={policyForm.plan_name} onChange={(e) => setPolicyForm((f) => ({ ...f, plan_name: e.target.value }))} className={inputCls} placeholder="e.g. Gold Plan" /></div>
              <div>
                <label className={labelCls}>Coverage Type</label>
                <div className="mt-1.5 flex gap-3">
                  {(["full", "partial", "co_pay"] as const).map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm">
                      <input type="radio" name="coverageType" value={t} checked={policyForm.coverage_type === t} onChange={() => setPolicyForm((f) => ({ ...f, coverage_type: t }))} className="accent-[var(--color-primary)]" />
                      <span className="capitalize">{t === "co_pay" ? "Co-pay" : t}</span>
                    </label>
                  ))}
                </div>
              </div>
              {policyForm.coverage_type !== "full" && (
                <div><label className={labelCls}>Co-pay %</label><input type="number" min={0} max={100} value={policyForm.copay_percent} onChange={(e) => setPolicyForm((f) => ({ ...f, copay_percent: e.target.value }))} className={inputCls} /></div>
              )}
              <div><label className={labelCls}>Effective Date *</label><input type="date" value={policyForm.effective_date} onChange={(e) => setPolicyForm((f) => ({ ...f, effective_date: e.target.value }))} className={inputCls} required /></div>
              <div><label className={labelCls}>Expiry Date</label><input type="date" value={policyForm.expiry_date} onChange={(e) => setPolicyForm((f) => ({ ...f, expiry_date: e.target.value }))} className={inputCls} /></div>
            </div>
            {error && <p role="alert" className={errorBanner}>{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => { setShowPolicyModal(false); setEditPolicy(null); setError(null); }} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={busy} className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* Coverage modal */}
      {showCoverageModal && (
        <ModalShell title={editCoverage ? "Edit Coverage Rule" : "Add Coverage Rule"} onClose={() => { setShowCoverageModal(false); setEditCoverage(null); setError(null); }}>
          <form onSubmit={(e) => { e.preventDefault(); saveCoverage(); }} className="mt-5 space-y-4">
            <div>
              <label className={labelCls}>Provider *</label>
              <select value={coverageForm.provider_id} onChange={(e) => setCoverageForm((f) => ({ ...f, provider_id: e.target.value }))} className={selectCls} required>
                <option value="">Select provider…</option>
                {providers.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Service Type</label>
              <select value={coverageForm.service_type} onChange={(e) => setCoverageForm((f) => ({ ...f, service_type: e.target.value }))} className={selectCls}>
                {SERVICE_TYPES.map((t) => (<option key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelCls}>Tariff Code</label><input value={coverageForm.tariff_code} onChange={(e) => setCoverageForm((f) => ({ ...f, tariff_code: e.target.value }))} className={inputCls} placeholder="e.g. TCS-001" /></div>
              <div><label className={labelCls}>Tariff Name *</label><input value={coverageForm.tariff_name} onChange={(e) => setCoverageForm((f) => ({ ...f, tariff_name: e.target.value }))} className={inputCls} required /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelCls}>Coverage %</label><input type="number" min={0} max={100} value={coverageForm.coverage_percent} onChange={(e) => setCoverageForm((f) => ({ ...f, coverage_percent: e.target.value }))} className={inputCls} /></div>
              <div><label className={labelCls}>Co-pay Amount</label><input type="number" min={0} step="0.01" value={coverageForm.copay_amount} onChange={(e) => setCoverageForm((f) => ({ ...f, copay_amount: e.target.value }))} className={inputCls} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={coverageForm.requires_auth} onChange={(e) => setCoverageForm((f) => ({ ...f, requires_auth: e.target.checked }))} className="accent-[var(--color-primary)]" />
              Requires pre-authorization
            </label>
            {error && <p role="alert" className={errorBanner}>{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => { setShowCoverageModal(false); setEditCoverage(null); setError(null); }} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={busy} className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* Claim creation modal */}
      {showClaimModal && (
        <ModalShell title="Create Claim" onClose={() => { setShowClaimModal(false); setError(null); }} wide>
          <form onSubmit={(e) => { e.preventDefault(); saveClaim(); }} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Patient *</label>
                <input value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} className={inputCls} placeholder="Search patient…" />
                {patientOptions.length > 0 && (
                  <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white shadow-lg">
                    {patientOptions.map((o) => (
                      <button key={o.id} type="button" onClick={() => { setClaimForm((f) => ({ ...f, patient_id: o.id })); setPatientSearch(o.label); setPatientOptions([]); }}
                        className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-[var(--color-muted)]">
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className={labelCls}>Provider *</label>
                <select value={claimForm.provider_id} onChange={(e) => setClaimForm((f) => ({ ...f, provider_id: e.target.value }))} className={selectCls} required>
                  <option value="">Select provider…</option>
                  {providers.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
              </div>
              <div><label className={labelCls}>Invoice ID (optional)</label><input value={claimForm.invoice_id} onChange={(e) => setClaimForm((f) => ({ ...f, invoice_id: e.target.value }))} className={inputCls} placeholder="Link to billing invoice" /></div>
              <div>
                <label className={labelCls}>Encounter Type</label>
                <select value={claimForm.encounter_type} onChange={(e) => setClaimForm((f) => ({ ...f, encounter_type: e.target.value }))} className={selectCls}>
                  {SERVICE_TYPES.map((t) => (<option key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>))}
                </select>
              </div>
              <div><label className={labelCls}>Billed Amount *</label><input type="number" min={0} step="0.01" value={claimForm.billed_amount} onChange={(e) => setClaimForm((f) => ({ ...f, billed_amount: e.target.value }))} className={inputCls} required /></div>
              <div><label className={labelCls}>Covered Amount *</label><input type="number" min={0} step="0.01" value={claimForm.covered_amount} onChange={(e) => setClaimForm((f) => ({ ...f, covered_amount: e.target.value }))} className={inputCls} required /></div>
              <div><label className={labelCls}>Co-pay Amount</label><input type="number" min={0} step="0.01" value={claimForm.copay_amount} onChange={(e) => setClaimForm((f) => ({ ...f, copay_amount: e.target.value }))} className={inputCls} /></div>
            </div>
            {error && <p role="alert" className={errorBanner}>{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => { setShowClaimModal(false); setError(null); }} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={busy} className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:opacity-60">{busy ? "Creating…" : "Create Claim"}</button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* Claim detail modal */}
      {selectedClaim && (
        <ModalShell title={`Claim ${selectedClaim.claim_number}`} onClose={() => setSelectedClaim(null)} wide>
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className={mutedFg}>Patient</span><p className="font-medium">{selectedClaim.patients ? `${selectedClaim.patients.first_name} ${selectedClaim.patients.last_name}` : "—"}</p></div>
              <div><span className={mutedFg}>Provider</span><p className="font-medium">{selectedClaim.insurance_providers?.name ?? "—"}</p></div>
              <div><span className={mutedFg}>Encounter Type</span><p className="font-medium">{selectedClaim.encounter_type ?? "—"}</p></div>
              <div><span className={mutedFg}>Date</span><p className="font-medium">{fmtDate(selectedClaim.encounter_date)}</p></div>
              <div><span className={mutedFg}>Billed</span><p className="font-semibold">{fmt(selectedClaim.billed_amount)}</p></div>
              <div><span className={mutedFg}>Covered</span><p className="font-semibold text-emerald-600">{fmt(selectedClaim.covered_amount)}</p></div>
              <div><span className={mutedFg}>Co-pay</span><p className="font-semibold text-amber-600">{fmt(selectedClaim.copay_amount)}</p></div>
              <div><span className={mutedFg}>Status</span><p>{statusBadge(selectedClaim.status, CLAIM_STATUS_CLS)}</p></div>
            </div>
            {selectedClaim.status === "draft" && (
              <div className="flex gap-2 border-t border-[var(--color-border)] pt-4">
                <button type="button" onClick={() => updateClaimStatus(selectedClaim.id, "submitted")} disabled={busy}
                  className="focus-ring rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">Submit Claim</button>
                <button type="button" onClick={() => { if (confirm("Delete this draft claim?")) { fetch(`/api/insurance/claims/${selectedClaim.id}`, { method: "DELETE" }).then(() => { setSelectedClaim(null); loadAll(); }); } }}
                  className="focus-ring rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">Delete Draft</button>
              </div>
            )}
            {selectedClaim.status === "submitted" && (
              <div className="flex gap-2 border-t border-[var(--color-border)] pt-4">
                <button type="button" onClick={() => updateClaimStatus(selectedClaim.id, "approved")} disabled={busy}
                  className="focus-ring rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">Approve</button>
                <button type="button" onClick={() => updateClaimStatus(selectedClaim.id, "rejected")} disabled={busy}
                  className="focus-ring rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">Reject</button>
              </div>
            )}
            {selectedClaim.status === "approved" && (
              <div className="flex gap-2 border-t border-[var(--color-border)] pt-4">
                <button type="button" onClick={() => updateClaimStatus(selectedClaim.id, "paid")} disabled={busy}
                  className="focus-ring rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">Mark Paid</button>
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {/* Authorization modal */}
      {showAuthModal && (
        <ModalShell title="New Pre-Authorization" onClose={() => { setShowAuthModal(false); setError(null); }}>
          <form onSubmit={(e) => { e.preventDefault(); saveAuth(); }} className="mt-5 space-y-4">
            <div>
              <label className={labelCls}>Patient *</label>
              <input value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} className={inputCls} placeholder="Search patient…" />
              {patientOptions.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white shadow-lg">
                  {patientOptions.map((o) => (
                    <button key={o.id} type="button" onClick={() => { setAuthForm((f) => ({ ...f, patient_id: o.id })); setPatientSearch(o.label); setPatientOptions([]); }}
                      className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-[var(--color-muted)]">
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className={labelCls}>Provider *</label>
              <select value={authForm.provider_id} onChange={(e) => setAuthForm((f) => ({ ...f, provider_id: e.target.value }))} className={selectCls} required>
                <option value="">Select provider…</option>
                {providers.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </div>
            <div><label className={labelCls}>Service Description *</label><input value={authForm.service_description} onChange={(e) => setAuthForm((f) => ({ ...f, service_description: e.target.value }))} className={inputCls} required placeholder="Describe the service" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelCls}>Estimated Amount *</label><input type="number" min={0} step="0.01" value={authForm.estimated_amount} onChange={(e) => setAuthForm((f) => ({ ...f, estimated_amount: e.target.value }))} className={inputCls} required /></div>
              <div><label className={labelCls}>Valid Until</label><input type="date" value={authForm.valid_until} onChange={(e) => setAuthForm((f) => ({ ...f, valid_until: e.target.value }))} className={inputCls} /></div>
            </div>
            {error && <p role="alert" className={errorBanner}>{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => { setShowAuthModal(false); setError(null); }} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={busy} className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:opacity-60">{busy ? "Creating…" : "Create"}</button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
}

/* ─── SHARED HELPERS ─── */
function ModalShell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={modalBackdrop} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`my-4 w-full rounded-2xl bg-white p-6 shadow-2xl ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className={flexBetween}>
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className={ghostIconBtn} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  const tones: Record<string, string> = {
    sky: "from-sky-500 to-sky-600",
    amber: "from-amber-500 to-amber-600",
    emerald: "from-emerald-500 to-emerald-600",
    rose: "from-rose-500 to-rose-600",
  };
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
      <p className="text-xs font-medium text-[var(--color-muted-fg)]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[var(--color-foreground)]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">{sub}</p>}
    </div>
  );
}
