"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, CheckSquare, Eye, FileDown, FlaskConical, ListChecks, Loader2, Pencil, Plus, ReceiptText, Search, Square, TestTube, Trash2, Wrench } from "lucide-react";
import { CLINICIAN_ROLES } from "@/lib/auth";
import ImportExportMenu from "@/components/ui/import-export-menu";
import { ActionDropdown } from "@/components/ui/action-dropdown";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";
import DateRangeBar from "@/components/filters/date-range-bar";

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
  invoice_id: string | null;
  payment_id: string | null;
  referrer: string | null;
  patients: { id: string; patient_number: string; first_name: string; last_name: string; user_id: string | null; is_walk_in: boolean | null } | null;
  users: { id: string; full_name: string } | null;
  lab_request_items: Array<{
    id: string;
    service_id: string | null;
    service_name: string;
    priority: string;
    sample_type: string | null;
    notes: string | null;
    result: string | null;
    result_unit: string | null;
    is_abnormal: boolean | null;
    reported_at: string | null;
  }>;
  lab_request_assignments?: Array<{
    user_id: string;
    users: { id: string; full_name: string; role: string } | null;
  }>;
  invoices?: { id: string; invoice_number: string; status: string; total_amount: number } | null;
  payments?: { id: string; reference: string | null; payment_method: string | null; amount: number; status: string; paid_at: string | null } | null;
}

const STATUS_FILTERS = ["all", "requested", "sample_collected", "in_progress", "completed", "cancelled"];

const REQUEST_EXPORT_COLUMNS = [
  "patient",
  "patient_number",
  "status",
  "requested_at",
  "requested_by",
  "services",
  "notes",
  "is_external",
  "invoice_number",
];

const SERVICE_EXPORT_COLUMNS = [
  "name",
  "type",
  "category",
  "price",
  "reference_range",
  "approval_status",
  "is_active",
  "external_lab_id",
];

const REQUEST_IMPORT_COLUMNS = ["patient_id", "service_name", "priority", "sample_type", "notes"];
const REQUEST_IMPORT_SAMPLE = [
  ["<patient UUID>", "Malaria Parasite", "routine", "Blood", "Routine check"],
];

const SERVICE_IMPORT_COLUMNS = ["name", "type", "price", "new_category", "reference_range", "external_lab_id"];
const SERVICE_IMPORT_SAMPLE = [
  ["Vitamin D Test", "lab", "15000", "Endocrinology", "30–100 ng/mL", ""],
];

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

export default function LabView({ canManageCatalog, canEditService, canEnterResults, canBill, initialTab = "requests" }: {
  canManageCatalog: boolean; canEditService: boolean; canEnterResults: boolean; canBill: boolean; initialTab?: "requests" | "services";
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"requests" | "services">(initialTab);
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddService, setShowAddService] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const servicesRef = useRef<LabService[]>([]);
  const [servicesReload, setServicesReload] = useState(0);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (filter !== "all") params.set("status", filter);
      if (q.trim()) params.set("q", q.trim());
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/lab-requests?${params.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load lab requests");
      setRequests(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lab requests");
    } finally {
      setLoading(false);
    }
  }, [filter, q, fromDate, toDate]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const viewed = viewId ? requests.find((r) => r.id === viewId) ?? null : null;

  const visibleRequests = useMemo(
    () => requests.filter((r) => inDateRange(r.requested_at, fromDate, toDate)),
    [requests, fromDate, toDate]
  );

  const requestRowsFor = (rs: LabRequest[]) =>
    rs.map((r) => [
      r.patients ? `${r.patients.first_name} ${r.patients.last_name}` : "Unknown",
      r.patients?.patient_number ?? "",
      r.status,
      r.requested_at ?? "",
      r.users?.full_name ?? "",
      r.lab_request_items.map((t) => t.service_name).join("; "),
      r.notes ?? "",
      r.is_external ? "yes" : "no",
      r.invoices?.invoice_number ?? "",
    ]);

  const serviceRowsFor = (svcs: LabService[]) =>
    svcs.map((s) => [
      s.name,
      s.type,
      s.lab_categories?.name ?? "",
      s.price,
      s.reference_range ?? "",
      s.approval_status,
      s.is_active ? "active" : "inactive",
      s.external_lab_id ?? "",
    ]);

  function exportCsv() {
    if (tab === "requests") {
      if (requests.length === 0) {
        alert("Nothing to export — there are no lab requests yet.");
        return;
      }
      downloadCsv(`lab-requests-${dateStamp()}.csv`, REQUEST_EXPORT_COLUMNS, requestRowsFor(requests));
    } else {
      const svcs = servicesRef.current;
      if (svcs.length === 0) {
        alert("Nothing to export — there are no lab services yet.");
        return;
      }
      downloadCsv(`lab-services-${dateStamp()}.csv`, SERVICE_EXPORT_COLUMNS, serviceRowsFor(svcs));
    }
  }

  function exportPdf() {
    if (tab === "requests") {
      if (requests.length === 0) {
        alert("Nothing to export — there are no lab requests yet.");
        return;
      }
      printTable("Lab Requests", REQUEST_EXPORT_COLUMNS, requestRowsFor(requests));
    } else {
      const svcs = servicesRef.current;
      if (svcs.length === 0) {
        alert("Nothing to export — there are no lab services yet.");
        return;
      }
      printTable("Lab Services", SERVICE_EXPORT_COLUMNS, serviceRowsFor(svcs));
    }
  }

  async function importRequests(rows: string[][]): Promise<ImportResult> {
    const errors: string[] = [];
    let created = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const res = await fetch("/api/lab-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId: r[0]?.trim(),
            items: [
              {
                serviceName: r[1]?.trim() || undefined,
                priority: r[2]?.trim() || "routine",
                sampleType: r[3]?.trim() || undefined,
                notes: r[4]?.trim() || undefined,
              },
            ],
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          errors.push(`Row ${i + 1}: ${body.error ?? "Failed to create lab request"}`);
          continue;
        }
        created++;
      } catch (e) {
        errors.push(`Row ${i + 1}: ${e instanceof Error ? e.message : "Network error"}`);
      }
    }
    return { created, failed: errors.length, errors };
  }

  async function importServices(rows: string[][]): Promise<ImportResult> {
    const records = rows.map((r) => ({
      name: r[0]?.trim(),
      type: r[1]?.trim() === "imaging" ? "imaging" : "lab",
      price: Number(r[2] ?? 0) || 0,
      newCategory: r[3]?.trim() || undefined,
      referenceRange: r[4]?.trim() || undefined,
      externalLabId: r[5]?.trim() || undefined,
    }));
    const res = await fetch("/api/lab-services/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Import failed");
    const payload = (body as { data?: { created?: number; updated?: number; errors?: Array<{ row?: number; message?: string }> } }).data ?? {};
    const errors = (payload.errors ?? []).map(
      (e: { row?: number; message?: string }) => `Row ${e.row ?? "?"}: ${e.message ?? "Unknown error"}`
    );
    const notes: string[] = [];
    if ((payload.updated ?? 0) > 0) notes.push(`${payload.updated} existing service(s) updated in place with the imported values.`);
    if ((payload.created ?? 0) > 0) notes.push(`${payload.created} new service(s) added.`);
    return { created: payload.created ?? 0, failed: errors.length, errors, notes };
  }

  const handleImported = () => {
    if (tab === "requests") void loadRequests();
    else setServicesReload((n) => n + 1);
    router.refresh();
  };

  const handleServicesChange = useCallback((svcs: LabService[]) => {
    servicesRef.current = svcs;
  }, []);

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
          <ImportExportMenu
            entityLabel={tab === "requests" ? "Lab Requests" : "Lab Services"}
            exportCsv={exportCsv}
            exportPdf={exportPdf}
            importColumns={tab === "requests" ? REQUEST_IMPORT_COLUMNS : SERVICE_IMPORT_COLUMNS}
            importSample={tab === "requests" ? REQUEST_IMPORT_SAMPLE : SERVICE_IMPORT_SAMPLE}
            templateFilename={tab === "requests" ? "lab-requests-import-template.csv" : "lab-services-import-template.csv"}
            onImport={tab === "requests" ? importRequests : importServices}
            onImported={handleImported}
          />
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
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter lab requests">
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
            <span className="mx-1 hidden h-5 w-px bg-[var(--color-border)] sm:block" aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search patient, service, referrer…"
              aria-label="Search lab requests"
              className="h-9 w-56 rounded-lg border border-[var(--color-border)] bg-white px-2 text-xs text-[var(--color-foreground)] outline-none transition-colors duration-200 focus:border-[var(--color-primary)]"
            />
            <DateRangeBar
              from={fromDate}
              to={toDate}
              onFromChange={setFromDate}
              onToChange={setToDate}
              onClear={() => {
                setFromDate("");
                setToDate("");
              }}
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" aria-hidden="true" />
            </div>
          ) : visibleRequests.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
              <FlaskConical size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
              <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">No lab requests found.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleRequests.map((req) => (
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
        <ServicesTab
          canManageCatalog={canManageCatalog}
          canEditService={canEditService}
          onChanged={() => router.refresh()}
          onServicesChange={handleServicesChange}
          reloadKey={servicesReload}
        />
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
          canBill={canBill}
          onClose={() => setViewId(null)}
          onChanged={loadRequests}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SERVICES TAB — catalog grouped by category with search, edit and approval
// ---------------------------------------------------------------------------
function ServicesTab({
  canManageCatalog,
  canEditService,
  onChanged,
  onServicesChange,
  reloadKey,
}: {
  canManageCatalog: boolean;
  canEditService: boolean;
  onChanged: () => void;
  onServicesChange?: (services: LabService[]) => void;
  reloadKey?: number;
}) {
  const [services, setServices] = useState<LabService[]>([]);
  const [typeFilter, setTypeFilter] = useState<"all" | "lab" | "imaging">("all");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<LabService | null>(null);
  const [viewing, setViewing] = useState<LabService | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyBulk, setBusyBulk] = useState(false);

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

  useEffect(() => {
    onServicesChange?.(services);
  }, [services, onServicesChange]);

  useEffect(() => {
    if (reloadKey && reloadKey > 0) void load();
  }, [reloadKey, load]);

  const categories = useMemo(() => {
    const set = new Set(services.map((s) => s.lab_categories?.name ?? "Uncategorized"));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [services]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter((s) => {
      if (activeFilter === "active" && !s.is_active) return false;
      if (activeFilter === "inactive" && s.is_active) return false;
      if (categoryFilter !== "all" && (s.lab_categories?.name ?? "Uncategorized") !== categoryFilter) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [services, search, categoryFilter, activeFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, LabService[]>();
    for (const s of filtered) {
      const key = s.lab_categories?.name ?? "Uncategorized";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

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
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function removeSelected() {
    if (selected.size === 0) return;
    const names = services.filter((s) => selected.has(s.id)).map((s) => s.name).join(", ");
    if (!confirm(`Delete ${selected.size} selected service(s)?\n\n${names}\n\nThis cannot be undone. Historical lab results keep their service names.`)) return;
    setBusyBulk(true);
    setError(null);
    try {
      let failed = 0;
      for (const id of selected) {
        const res = await fetch(`/api/lab-services/${id}`, { method: "DELETE" });
        const json = await res.json();
        if (!res.ok) {
          failed++;
          console.error(json.error ?? `Failed to delete service ${id}`);
        }
      }
      setSelected(new Set());
      if (failed > 0) setError(`${failed} service(s) could not be deleted.`);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk delete failed");
    } finally {
      setBusyBulk(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (filtered.every((s) => next.has(s.id))) {
        for (const s of filtered) next.delete(s.id);
      } else {
        for (const s of filtered) next.add(s.id);
      }
      return next;
    });
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

      <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search services by name…"
            aria-label="Search services by name"
            className={`${inputCls} pl-9`}
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by group"
          className={`${inputCls} sm:w-56`}
        >
          <option value="all">All groups</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as "all" | "active" | "inactive")}
          aria-label="Filter by availability"
          className={`${inputCls} sm:w-44`}
        >
          <option value="all">Active &amp; inactive</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
        {canEditService && services.length > 0 && (
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary)] px-3.5 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]"
          >
            <ListChecks size={16} aria-hidden="true" /> Bulk prices
          </button>
        )}
        {canManageCatalog && services.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2.5 text-sm font-semibold text-[var(--color-foreground)] transition-colors duration-200 hover:bg-[var(--color-muted)]"
              aria-pressed={filtered.length > 0 && filtered.every((s) => selected.has(s.id))}
            >
              {filtered.length > 0 && filtered.every((s) => selected.has(s.id)) ? (
                <CheckSquare size={16} aria-hidden="true" />
              ) : (
                <Square size={16} aria-hidden="true" />
              )}
              {filtered.length > 0 && filtered.every((s) => selected.has(s.id)) ? "Deselect all" : "Select all"}
            </button>
            <button
              type="button"
              onClick={removeSelected}
              disabled={selected.size === 0 || busyBulk}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-600 transition-colors duration-200 hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 size={15} aria-hidden="true" /> Delete selected{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" aria-hidden="true" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <TestTube size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">
            {services.length === 0 ? "No services in the catalog yet." : "No services match your search."}
          </p>
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
                      {canManageCatalog && (
                        <input
                          type="checkbox"
                          checked={selected.has(s.id)}
                          onChange={() => toggleSelect(s.id)}
                          aria-label={`Select ${s.name}`}
                          className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                        />
                      )}
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
                      {canEditService && (
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
                      <ActionDropdown
                        label="Actions"
                        variant="outline"
                        align="right"
                        ariaLabel={`Actions for ${s.name}`}
                        className="[&>button]:!px-2.5 [&>button]:!py-1 [&>button]:!text-xs [&>button]:!gap-1"
                        items={[
                          { label: "View", description: "Service details", icon: <Eye size={14} aria-hidden="true" />, onClick: () => setViewing(s) },
                          ...(canEditService
                            ? [{ label: "Edit", description: "Change price, group, availability", icon: <Pencil size={14} aria-hidden="true" />, onClick: () => setEditing(s) }]
                            : []),
                          ...(canManageCatalog
                            ? [{ label: "Delete", description: "Remove from the catalog", icon: <Trash2 size={14} aria-hidden="true" />, danger: true, onClick: () => remove(s.id, s.name) }]
                            : []),
                        ]}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <EditServiceModal
          service={editing}
          canCreateCategories={canManageCatalog}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            onChanged();
          }}
        />
      )}

      {viewing && <ViewServiceModal service={viewing} onClose={() => setViewing(null)} />}

      {bulkOpen && (
        <BulkPriceModal
          services={services}
          onClose={() => setBulkOpen(false)}
          onSaved={() => {
            setBulkOpen(false);
            load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VIEW SERVICE MODAL — read-only catalog details (all staff)
// ---------------------------------------------------------------------------
function ViewServiceModal({ service, onClose }: { service: LabService; onClose: () => void }) {
  return (
    <ModalShell title={service.name} onClose={onClose}>
      <div className="mt-5 space-y-4 text-sm">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <dt className="text-xs text-[var(--color-muted-fg)]">Type</dt>
            <dd className="font-medium capitalize text-[var(--color-foreground)]">{service.type}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-muted-fg)]">Price</dt>
            <dd className="font-medium text-[var(--color-foreground)]">₦{Number(service.price).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-muted-fg)]">Group / category</dt>
            <dd className="font-medium text-[var(--color-foreground)]">{service.lab_categories?.name ?? "Uncategorized"}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-muted-fg)]">Availability</dt>
            <dd className={`font-medium ${service.is_active ? "text-emerald-600" : "text-[var(--color-muted-fg)]"}`}>
              {service.is_active ? "Active" : "Inactive"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-muted-fg)]">Reference range</dt>
            <dd className="font-medium text-[var(--color-foreground)]">{service.reference_range ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-muted-fg)]">External lab ID</dt>
            <dd className="font-medium text-[var(--color-foreground)]">{service.external_lab_id ?? "—"}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${approvalBadge(service.approval_status)}`}>
            {service.approval_status}
          </span>
          {service.is_custom && (
            <span className="rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary-dark)]">
              Custom
            </span>
          )}
        </div>
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring w-full rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// EDIT SERVICE MODAL — name, group, type, amount, availability (admin + lab staff)
// ---------------------------------------------------------------------------
function EditServiceModal({
  service,
  canCreateCategories,
  onClose,
  onSaved,
}: {
  service: LabService;
  canCreateCategories: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [isActive, setIsActive] = useState(service.is_active);

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
      const body: Record<string, unknown> = {
        name: form.get("name"),
        category_id: (form.get("categoryId") as string) || null,
        type: form.get("type") || "lab",
        price: Number(form.get("price") ?? 0),
        reference_range: (form.get("referenceRange") as string) || null,
        external_lab_id: (form.get("externalLabId") as string) || null,
        is_active: isActive,
      };
      const res = await fetch(`/api/lab-services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save changes");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save changes");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={`Edit service — ${service.name}`} onClose={onClose}>
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(new FormData(e.currentTarget));
        }}
      >
        <div>
          <label className={labelCls} htmlFor="edit-name">Service name</label>
          <input id="edit-name" name="name" required defaultValue={service.name} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls} htmlFor="edit-type">Type</label>
            <select id="edit-type" name="type" className={inputCls} defaultValue={service.type}>
              <option value="lab">Lab test</option>
              <option value="imaging">Imaging / Scan</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="edit-price">Amount (₦)</label>
            <input id="edit-price" name="price" type="number" min={0} step="0.01" defaultValue={service.price ?? 0} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="edit-category">Group / category</label>
          <select id="edit-category" name="categoryId" className={inputCls} defaultValue={service.category_id ?? ""}>
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {canCreateCategories && (
            <p className="mt-1 text-xs text-[var(--color-muted-fg)]">
              New groups can be created from the &quot;Add Service&quot; form.
            </p>
          )}
        </div>
        <div>
          <label className={labelCls} htmlFor="edit-range">Reference range (optional)</label>
          <input id="edit-range" name="referenceRange" defaultValue={service.reference_range ?? ""} className={inputCls} placeholder="e.g. 30–100 ng/mL" />
        </div>
        <div>
          <label className={labelCls} htmlFor="edit-ext">External lab ID (optional)</label>
          <input id="edit-ext" name="externalLabId" defaultValue={service.external_lab_id ?? ""} className={inputCls} placeholder="e.g. EXT-0091" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--color-foreground)]">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-[var(--color-primary)]" />
          Available for ordering (active)
        </label>
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
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// BULK PRICE MODAL — enter amounts for many services at once (admin + lab staff)
// ---------------------------------------------------------------------------
function BulkPriceModal({
  services,
  onClose,
  onSaved,
}: {
  services: LabService[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [prices, setPrices] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const s of services) map[s.id] = String(s.price ?? 0);
    return map;
  });
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const changed = useMemo(
    () => services.filter((s) => Number(prices[s.id] ?? 0) !== Number(s.price ?? 0)),
    [services, prices]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [services, search]);

  async function handleSave() {
    setBusy(true);
    setError(null);
    setSummary(null);
    const updates = services.filter((s) => Number(prices[s.id] ?? 0) !== Number(s.price ?? 0));
    let saved = 0;
    try {
      for (const s of updates) {
        const value = Number(prices[s.id]);
        if (!Number.isFinite(value) || value < 0) {
          throw new Error(`Invalid amount for "${s.name}"`);
        }
        const res = await fetch(`/api/lab-services/${s.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ price: value }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Failed to update "${s.name}"`);
        saved++;
      }
      setSummary(`${saved} service${saved === 1 ? "" : "s"} updated.`);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk update failed");
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Bulk service prices" onClose={onClose} wide>
      <div className="mt-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-[200px] flex-1">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter services…"
              aria-label="Filter services"
              className={`${inputCls} pl-9`}
            />
          </div>
          <p className="text-xs text-[var(--color-muted-fg)]">
            {changed.length} changed · {rows.length} shown
          </p>
        </div>

        <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[var(--color-muted)]">
              <tr className="text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                <th scope="col" className="px-4 py-2.5 font-semibold">Service</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Group</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Current</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Amount (₦)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((s) => {
                const edited = Number(prices[s.id] ?? 0) !== Number(s.price ?? 0);
                return (
                  <tr key={s.id} className={edited ? "bg-[var(--color-primary-soft)]/50" : undefined}>
                    <td className="px-4 py-2">
                      <p className={`font-medium ${s.is_active ? "text-[var(--color-foreground)]" : "text-[var(--color-muted-fg)]"}`}>
                        {s.name}
                      </p>
                      <p className="text-xs text-[var(--color-muted-fg)]">
                        {s.type} · {s.approval_status}
                      </p>
                    </td>
                    <td className="px-4 py-2 text-xs text-[var(--color-muted-fg)]">
                      {s.lab_categories?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-[var(--color-muted-fg)]">
                      ₦{Number(s.price ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={prices[s.id] ?? ""}
                        onChange={(e) => setPrices({ ...prices, [s.id]: e.target.value })}
                        aria-label={`Amount for ${s.name}`}
                        className={`${inputCls} !py-1.5 w-36`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--color-muted-fg)]">No services match your filter.</p>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
            {error}
          </p>
        )}
        {summary && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{summary}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || changed.length === 0}
            className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
          >
            {busy ? "Saving…" : changed.length === 0 ? "No changes" : `Save ${changed.length} price${changed.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </ModalShell>
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
    const newCategory = ((form.get("newCategory") as string) ?? "").trim();
    if (newCategory && /^\d+(\.\d+)?$/.test(newCategory)) {
      setError(`Category "${newCategory}" looks like a price — use a real category name.`);
      setBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/lab-services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          categoryId: (form.get("categoryId") as string) || undefined,
          newCategory: newCategory || undefined,
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
            .map((s: { id: string; users?: { id?: string; full_name?: string; role?: string } }) => ({
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
              <label className={labelCls} htmlFor="wi-email">Email {payMethod === "paystack" && <span className="text-[var(--color-muted-fg)]">(required for Paystack)</span>}</label>
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
                      <span className="font-medium text-[var(--color-foreground)]">{s.label}</span>
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

        {isWalkIn && (
          <div className="rounded-xl border border-[var(--color-border)] p-3">
            <p className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">
              Instant payment — ₦{selectedTotal.toLocaleString()}
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
          <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
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
                  ? `Collect ₦${selectedTotal.toLocaleString()} & create request`
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
function RequestDetailModal({
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
        <div className="flex flex-wrap items-center gap-2">
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
              Paid · {request.payments.reference ?? "—"} · {request.payments.payment_method?.replace(/_/g, " ") ?? "—"} · ₦
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
                {request.invoices.invoice_number} · {request.invoices.status.replace(/_/g, " ")} · ₦
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
          <p className="text-sm text-[var(--color-muted-fg)]">
            <span className="font-semibold text-[var(--color-foreground)]">Notes: </span>
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
                <th scope="col" className="px-4 py-2.5 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
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
                      <span className="text-[var(--color-muted-fg)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canWork && canEnterResults && !request.is_external && ["sample_collected", "in_progress"].includes(request.status) && (
          <div className="rounded-xl border border-[var(--color-border)] bg-slate-50/60 p-4">
            <p className="text-sm font-semibold text-[var(--color-foreground)]">Enter lab results</p>
            <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
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
            <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
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
