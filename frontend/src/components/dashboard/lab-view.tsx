"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2, Plus, TestTube, Wrench } from "lucide-react";
import { CLINICIAN_ROLES } from "@/lib/auth";

interface LabService {
  id: string;
  category_id: string | null;
  name: string;
  type: "lab" | "imaging";
  is_custom: boolean;
  external_lab_id: string | null;
  approval_status: "approved" | "pending" | "rejected";
  price: number;
  reference_range: string | null;
  is_active: boolean;
  lab_categories: { id: string; name: string } | null;
}

interface LabRequest {
  id: string;
  status: string;
  is_external: boolean;
  external_lab_id: string | null;
  requested_at: string;
  notes: string | null;
  patients: { id: string; patient_number: string; first_name: string; last_name: string; user_id: string | null } | null;
  users: { id: string; full_name: string } | null;
  lab_request_items: Array<{
    id: string;
    service_id: string | null;
    service_name: string;
    priority: string;
    sample_type: string | null;
    notes: string | null;
  }>;
}

const STATUS_FILTERS = ["all", "requested", "sample_collected", "in_progress", "completed", "cancelled"];

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

function statusClass(status: string): string {
  switch (status) {
    case "requested": return "bg-slate-100 text-slate-600";
    case "sample_collected": return "bg-sky-100 text-sky-700";
    case "in_progress": return "bg-amber-100 text-amber-700";
    case "completed": return "bg-emerald-100 text-emerald-700";
    default: return "bg-red-100 text-red-700";
  }
}

function approvalBadge(status: string): string {
  switch (status) {
    case "approved": return "bg-emerald-100 text-emerald-700";
    case "pending": return "bg-amber-100 text-amber-700";
    default: return "bg-red-100 text-red-700";
  }
}

export default function LabView({ canManageCatalog, canEnterResults }: { canManageCatalog: boolean; canEnterResults: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<"requests" | "services">("requests");
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddService, setShowAddService] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (filter !== "all") params.set("status", filter);
      const res = await fetch(`/api/lab-requests?${params.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load lab requests");
      setRequests(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lab requests");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const viewed = viewId ? requests.find((r) => r.id === viewId) ?? null : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Laboratory</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
            Lab &amp; imaging requests, service catalog and custom services.
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "services" ? (
            <button
              type="button"
              onClick={() => setShowAddService(true)}
              className="focus-ring inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--color-foreground)] transition-colors duration-200 hover:border-[var(--color-primary)]"
            >
              <Wrench size={16} aria-hidden="true" /> Add Service
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]"
            >
              <Plus size={16} aria-hidden="true" /> New Lab Request
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Lab module sections">
        <button
          type="button"
          onClick={() => setTab("requests")}
          aria-pressed={tab === "requests"}
          className={`focus-ring rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
            tab === "requests" ? "bg-[var(--color-primary)] text-white" : "bg-white text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
          }`}
        >
          Requests
        </button>
        <button
          type="button"
          onClick={() => setTab("services")}
          aria-pressed={tab === "services"}
          className={`focus-ring rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
            tab === "services" ? "bg-[var(--color-primary)] text-white" : "bg-white text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
          }`}
        >
          Services
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      {tab === "requests" ? (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter lab requests">
            {STATUS_FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                aria-pressed={filter === item}
                className={`focus-ring rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-colors duration-200 ${
                  filter === item ? "bg-[var(--color-primary)] text-white" : "bg-white text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
                }`}
              >
                {item.replace(/_/g, " ")}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" aria-hidden="true" />
            </div>
          ) : requests.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
              <FlaskConical size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
              <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">No lab requests found.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {requests.map((req) => (
                <div key={req.id} className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--color-foreground)]">
                        {req.patients ? `${req.patients.first_name} ${req.patients.last_name}` : "Unknown"}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
                        {req.patients?.patient_number ?? ""} · {new Date(req.requested_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClass(req.status)}`}>
                      {req.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {req.is_external && (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                        External{req.external_lab_id ? ` · ${req.external_lab_id}` : ""}
                      </span>
                    )}
                    {req.users && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                        {req.users.full_name}
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-[var(--color-muted-fg)]">
                    {req.lab_request_items.map((t) => t.service_name).join(", ")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setViewId(req.id)}
                    className="focus-ring mt-3 w-full rounded-lg border border-[var(--color-border)] py-2 text-xs font-semibold text-[var(--color-primary)] transition-colors duration-200 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
                  >
                    View request
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <ServicesTab canManageCatalog={canManageCatalog} onChanged={() => router.refresh()} />
      )}

      {showCreate && (
        <CreateRequestModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadRequests();
          }}
        />
      )}

      {showAddService && (
        <AddServiceModal
          canManageCatalog={canManageCatalog}
          onClose={() => setShowAddService(false)}
          onAdded={() => {
            setShowAddService(false);
          }}
        />
      )}

      {viewed && (
        <RequestDetailModal
          request={viewed}
          canEnterResults={canEnterResults}
          onClose={() => setViewId(null)}
          onChanged={loadRequests}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SERVICES TAB — catalog grouped by category with approval management
// ---------------------------------------------------------------------------
function ServicesTab({ canManageCatalog, onChanged }: { canManageCatalog: boolean; onChanged: () => void }) {
  const [services, setServices] = useState<LabService[]>([]);
  const [typeFilter, setTypeFilter] = useState<"all" | "lab" | "imaging">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pageSize: "500", include_inactive: "true" });
      if (typeFilter !== "all") params.set("type", typeFilter);
      const res = await fetch(`/api/lab-services?${params.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load services");
      setServices(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load services");
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, LabService[]>();
    for (const s of services) {
      const key = s.lab_categories?.name ?? "Uncategorized";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [services]);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/lab-services/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete service "${name}"? This cannot be undone.`)) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/lab-services/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter service type">
        {(["all", "lab", "imaging"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            aria-pressed={typeFilter === t}
            className={`focus-ring rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-colors duration-200 ${
              typeFilter === t ? "bg-[var(--color-primary)] text-white" : "bg-white text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" aria-hidden="true" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <TestTube size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">No services in the catalog yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, items]) => (
            <section key={category}>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]">
                {category}
                <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-muted-fg)]">
                  {items.length}
                </span>
              </h2>
              <div className="mt-2 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
                <ul className="divide-y divide-[var(--color-border)]">
                  {items.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className={`font-medium ${s.is_active ? "text-[var(--color-foreground)]" : "text-[var(--color-muted-fg)] line-through"}`}>
                          {s.name}
                          {s.is_custom && (
                            <span className="ml-2 rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary-dark)]">
                              Custom
                            </span>
                          )}
                          {s.external_lab_id && (
                            <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                              External · {s.external_lab_id}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-[var(--color-muted-fg)]">
                          {s.type} · ₦{Number(s.price).toLocaleString()}
                          {s.reference_range ? ` · ${s.reference_range}` : ""}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${approvalBadge(s.approval_status)}`}>
                        {s.approval_status}
                      </span>
                      {canManageCatalog && s.approval_status !== "approved" && (
                        <button
                          type="button"
                          disabled={busyId === s.id}
                          onClick={() => patch(s.id, { approval_status: "approved" })}
                          className="focus-ring rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition-colors duration-200 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          Approve
                        </button>
                      )}
                      {canManageCatalog && s.approval_status !== "rejected" && s.approval_status !== "approved" && (
                        <button
                          type="button"
                          disabled={busyId === s.id}
                          onClick={() => patch(s.id, { approval_status: "rejected" })}
                          className="focus-ring rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 transition-colors duration-200 hover:bg-red-100 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      )}
                      {canManageCatalog && (
                        <button
                          type="button"
                          disabled={busyId === s.id}
                          onClick={() => patch(s.id, { is_active: !s.is_active })}
                          className={`focus-ring rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors duration-200 disabled:opacity-60 ${
                            s.is_active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-[var(--color-muted)] text-[var(--color-muted-fg)] hover:bg-slate-200"
                          }`}
                        >
                          {s.is_active ? "Active" : "Inactive"}
                        </button>
                      )}
                      {canManageCatalog && s.is_custom && (
                        <button
                          type="button"
                          disabled={busyId === s.id}
                          onClick={() => remove(s.id, s.name)}
                          className="focus-ring rounded-lg px-2 py-1 text-xs font-medium text-rose-600 transition-colors duration-200 hover:bg-rose-50 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ADD SERVICE MODAL — user-defined custom services (approval-aware)
// ---------------------------------------------------------------------------
function AddServiceModal({ canManageCatalog, onClose, onAdded }: { canManageCatalog: boolean; onClose: () => void; onAdded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/lab-categories?pageSize=100", { cache: "no-store" });
        const body = await res.json();
        if (res.ok) setCategories(body.data ?? []);
      } catch {
        /* options non-critical */
      }
    })();
  }, []);

  async function handleSubmit(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lab-services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          categoryId: (form.get("categoryId") as string) || undefined,
          newCategory: (form.get("newCategory") as string) || undefined,
          type: form.get("type") || "lab",
          price: Number(form.get("price") || 0),
          referenceRange: (form.get("referenceRange") as string) || undefined,
          externalLabId: (form.get("externalLabId") as string) || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to add service");
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add service");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Add Service" onClose={onClose}>
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(new FormData(e.currentTarget));
        }}
      >
        <div>
          <label className={labelCls} htmlFor="svc-name">Service name</label>
          <input id="svc-name" name="name" required className={inputCls} placeholder="e.g. Vitamin D Test" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls} htmlFor="svc-type">Type</label>
            <select id="svc-type" name="type" className={inputCls} defaultValue="lab">
              <option value="lab">Lab test</option>
              <option value="imaging">Imaging / Scan</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="svc-price">Price (₦)</label>
            <input id="svc-price" name="price" type="number" min={0} step="0.01" defaultValue={0} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="svc-category">Category</label>
          <select id="svc-category" name="categoryId" className={inputCls} defaultValue="">
            <option value="">Select category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        {canManageCatalog && (
          <div>
            <label className={labelCls} htmlFor="svc-new-category">…or new category (admins)</label>
            <input id="svc-new-category" name="newCategory" className={inputCls} placeholder="e.g. Endocrinology" />
          </div>
        )}
        <div>
          <label className={labelCls} htmlFor="svc-range">Reference range (optional)</label>
          <input id="svc-range" name="referenceRange" className={inputCls} placeholder="e.g. 30–100 ng/mL" />
        </div>
        <div>
          <label className={labelCls} htmlFor="svc-ext">External lab ID (optional)</label>
          <input id="svc-ext" name="externalLabId" className={inputCls} placeholder="e.g. EXT-0091" />
        </div>
        <p className="rounded-lg bg-[var(--color-muted)]/40 px-3 py-2 text-xs text-[var(--color-muted-fg)]">
          {canManageCatalog
            ? "This service will be available immediately for new requests."
            : "Your service will be pending approval and available once a hospital admin approves it."}
        </p>
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
            {busy ? "Adding…" : "Add service"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// CREATE REQUEST MODAL — patient + optional doctor + services grouped by category
// ---------------------------------------------------------------------------
function CreateRequestModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patients, setPatients] = useState<{ id: string; label: string }[]>([]);
  const [doctors, setDoctors] = useState<{ id: string; label: string }[]>([]);
  const [services, setServices] = useState<LabService[]>([]);
  const [selected, setSelected] = useState<Record<string, { sampleType: string; priority: string }>>({});

  useEffect(() => {
    (async () => {
      try {
        const [patientRes, staffRes, serviceRes] = await Promise.all([
          fetch("/api/patients?pageSize=100", { cache: "no-store" }),
          fetch("/api/staff?pageSize=100", { cache: "no-store" }),
          fetch("/api/lab-services?pageSize=500", { cache: "no-store" }),
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
            .filter((s: { users?: { role?: string } }) => !!s.users?.role && CLINICIAN_ROLES.includes(s.users.role as (typeof CLINICIAN_ROLES)[number]))
            .map((s: { id: string; users?: { id?: string; full_name?: string } }) => ({
              id: s.users?.id ?? s.id,
              label: s.users?.full_name ?? "Doctor",
            }))
        );
        setServices(
          (serviceBody.data ?? []).filter(
            (s: LabService) => s.is_active && s.approval_status === "approved"
          )
        );
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

  async function handleSubmit(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const items = Object.entries(selected).map(([serviceId, opts]) => ({
        serviceId,
        priority: opts.priority || "routine",
        sampleType: opts.sampleType || undefined,
      }));
      const res = await fetch("/api/lab-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: form.get("patientId"),
          doctorId: (form.get("doctorId") as string) || undefined,
          isExternal: form.get("isExternal") === "on",
          externalLabId: (form.get("externalLabId") as string) || undefined,
          notes: (form.get("notes") as string) || undefined,
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
            <input type="checkbox" name="isExternal" className="h-4 w-4 accent-[var(--color-primary)]" />
            Send to an external lab
          </label>
          <input name="externalLabId" className={`${inputCls} !py-2 max-w-xs flex-1 text-sm`} placeholder="External lab ID (optional)" />
        </div>

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
                          <span className="font-medium text-[var(--color-foreground)]">{svc.name}</span>
                          <span className="ml-2 text-xs text-[var(--color-muted-fg)]">
                            {svc.type === "imaging" ? "imaging" : "lab"} · ₦{Number(svc.price).toLocaleString()}
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

        <div>
          <label className={labelCls} htmlFor="lr-notes">Notes (optional)</label>
          <textarea id="lr-notes" name="notes" rows={2} className={inputCls} />
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
          <button type="submit" disabled={busy || Object.keys(selected).length === 0} className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60">
            {busy ? "Creating…" : "Create lab request"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// REQUEST DETAIL MODAL — status flow + items
// ---------------------------------------------------------------------------
function RequestDetailModal({
  request,
  canEnterResults,
  onClose,
  onChanged,
}: {
  request: LabRequest;
  canEnterResults: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const canWork = ["requested", "sample_collected", "in_progress"].includes(request.status);

  return (
    <ModalShell
      title={`Lab request — ${request.patients ? `${request.patients.first_name} ${request.patients.last_name}` : ""}`}
      onClose={onClose}
      wide
    >
      <div className="mt-5 space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(request.status)}`}>
            {request.status.replace(/_/g, " ")}
          </span>
          {request.is_external && (
            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
              External{request.external_lab_id ? ` · ${request.external_lab_id}` : ""}
            </span>
          )}
          <span className="text-sm text-[var(--color-muted-fg)]">
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
          <p className="text-sm text-[var(--color-muted-fg)]">
            <span className="font-semibold text-[var(--color-foreground)]">Notes: </span>
            {request.notes}
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
                <th scope="col" className="px-4 py-2.5 font-semibold">Service</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Priority</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Sample</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {request.lab_request_items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2.5 font-medium text-[var(--color-foreground)]">{item.service_name}</td>
                  <td className="px-4 py-2.5 text-xs capitalize text-[var(--color-muted-fg)]">{item.priority}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{item.sample_type ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{item.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
