"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Wrench } from "lucide-react";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";
import { errorBanner, mutedSm, pageTitle } from "@/lib/ui-constants";
import {
  LabRequest,
  LabService,
  REQUEST_EXPORT_COLUMNS,
  SERVICE_EXPORT_COLUMNS,
  REQUEST_IMPORT_COLUMNS,
  REQUEST_IMPORT_SAMPLE,
  SERVICE_IMPORT_COLUMNS,
  SERVICE_IMPORT_SAMPLE,
} from "./lab/lab-shared";
import { RequestsTab } from "./lab/lab-requests-tab";
import { CreateRequestModal, RequestDetailModal } from "./lab/lab-request-modals";
import { AddServiceModal, ServicesTab } from "./lab/lab-services-tab";

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
          <h1 className={pageTitle}>Laboratory</h1>
          <p className={mutedSm}>
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
        <p role="alert" className={errorBanner}>
          {error}
        </p>
      )}

      {tab === "requests" ? (
        <RequestsTab
          filter={filter}
          onFilterChange={setFilter}
          q={q}
          onQueryChange={setQ}
          fromDate={fromDate}
          toDate={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
          onClearDates={() => {
            setFromDate("");
            setToDate("");
          }}
          loading={loading}
          requests={visibleRequests}
          onView={setViewId}
        />
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