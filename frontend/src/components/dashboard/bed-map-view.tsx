"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import {
  BedDouble,
  Check,
  Coins,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Satellite,
  Users,
  X,
} from "lucide-react";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";
import FilterBar from "@/components/filters/filter-bar";
import type { AccessLevel } from "@/lib/nav";

const EXPORT_COLUMNS = [
  "ward",
  "ward_type",
  "bed_number",
  "status",
  "occupant",
  "patient_number",
  "admitted_at",
];

const IMPORT_COLUMNS = ["ward_id", "bed_number"];
const IMPORT_SAMPLE = [
  ["<ward UUID>", "WARD-01"],
];

const btnPrimary =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60";
const btnGhost =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-foreground)] transition-colors duration-200 hover:bg-slate-50 disabled:opacity-60";
const statusCls: Record<string, string> = {
  available: "border-emerald-200 bg-emerald-50 text-emerald-700",
  occupied: "border-rose-200 bg-rose-50 text-rose-700",
  maintenance: "border-amber-200 bg-amber-50 text-amber-700",
  cleaning: "border-sky-200 bg-sky-50 text-sky-700",
};
const inputCls =
  "h-9 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-foreground)] outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]";
const WARD_TYPES = ["general", "private", "icu", "maternity", "surgical", "pediatric", "observation"];

interface BedRow {
  id: string; bedNumber: string; status: string;
  occupant?: {
    patient_id: string; name: string; patientNumber: string; admissionId: string; admittedAt: string;
  } | null;
}

interface WardRow {
  id: string; name: string; ward_type: string | null; is_active: boolean;
  beds: BedRow[];
}

interface WardDetail {
  id: string;
  name: string;
  ward_type: string | null;
  is_active: boolean;
  beds: Array<{ id: string; bed_number: string; status: string }>;
  ward_daily_rates: Array<{ id: string; rate: number }> | null;
}

function ModalShell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={`max-h-[85vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ${wide ? "max-w-2xl" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[var(--color-foreground)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="focus-ring rounded-full p-1.5 text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-[var(--color-muted)]"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function BedMapView({ canManage, accessLevel = "full" }: { canManage: boolean; accessLevel?: AccessLevel }) {
  const viewOnly = accessLevel === "view_only";
  const [wards, setWards] = useState<WardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const [managing, setManaging] = useState(false);
  const [details, setDetails] = useState<WardDetail[]>([]);
  const [showWardModal, setShowWardModal] = useState(false);
  const [editingWard, setEditingWard] = useState<WardDetail | null>(null);
  const [addingBedTo, setAddingBedTo] = useState<string | null>(null);
  const [bedInputs, setBedInputs] = useState<Record<string, string>>({});
  const [configBusy, setConfigBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/bed-availability", { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) { setToast(body.error ?? "Failed to load bed map"); setLoading(false); return; }
    setWards((body.data ?? []).filter((w: WardRow) => w.is_active));
    setLoading(false);
  }, []);

  const loadDetails = useCallback(async () => {
    const res = await fetch("/api/wards", { cache: "no-store" });
    const body = await res.json();
    if (res.ok) setDetails(body.data ?? []);
  }, []);

  useEffect(() => {
    void load();
    const supabase = getSupabase();
    const channel = supabase
      .channel("bed-map-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "beds" },
        () => { void load(); if (managing) void loadDetails(); }
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") setConnected(true);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnected(false);
      });
    unsubRef.current = () => { void supabase.removeChannel(channel); };
    return () => unsubRef.current?.();
  }, [load, loadDetails, managing]);

  useEffect(() => {
    if (managing) void loadDetails();
  }, [managing, loadDetails]);

  const filterActive = Boolean(search.trim() || from || to || statusFilter);

  const bedPasses = (b: BedRow) => {
    if (statusFilter && b.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (q) {
      const occupantText = b.occupant ? `${b.occupant.name} ${b.occupant.patientNumber}`.toLowerCase() : "";
      if (!b.bedNumber.toLowerCase().includes(q) && !occupantText.includes(q)) return false;
    }
    if (from || to) {
      if (b.occupant && !inDateRange(b.occupant.admittedAt, from, to)) return false;
    }
    return true;
  };

  const filteredWards = wards
    .map((w) => {
      const q = search.trim().toLowerCase();
      const wardMatches = !q || w.name.toLowerCase().includes(q);
      return { ...w, beds: wardMatches ? (w.beds ?? []).filter((b) => bedPasses(b)) : [] };
    })
    .filter((w) => w.beds.length > 0 || !filterActive);

  const filteredDetails = details
    .map((w) => {
      const q = search.trim().toLowerCase();
      const wardMatches = !q || w.name.toLowerCase().includes(q);
      const beds = (w.beds ?? []).filter((b) => {
        if (statusFilter && b.status !== statusFilter) return false;
        if (q && !b.bed_number.toLowerCase().includes(q)) return false;
        return true;
      });
      return { ...w, beds: wardMatches ? beds : [] };
    })
    .filter((w) => w.beds.length > 0 || !filterActive);

  const totals = filteredWards.reduce(
    (acc, w) => {
      for (const b of w.beds) {
        acc.total += 1;
        if (b.status === "occupied") acc.occupied += 1;
        else if (b.status === "available") acc.available += 1;
        else acc.other += 1;
      }
      return acc;
    },
    { total: 0, occupied: 0, available: 0, other: 0 }
  );

  const refreshAll = async () => {
    await load();
    if (managing) await loadDetails();
  };

  const rowsFor = (ws: WardRow[]) =>
    ws.flatMap((w) =>
      (w.beds ?? []).map((b) => [
        w.name,
        w.ward_type ?? "",
        b.bedNumber,
        b.status,
        b.occupant?.name ?? "",
        b.occupant?.patientNumber ?? "",
        b.occupant?.admittedAt ?? "",
      ])
    );

  function exportCsv() {
    if (filteredWards.length === 0) {
      alert("Nothing to export — there are no wards on the bed map yet.");
      return;
    }
    downloadCsv(`bed-map-${dateStamp()}.csv`, EXPORT_COLUMNS, rowsFor(filteredWards));
  }

  function exportPdf() {
    if (filteredWards.length === 0) {
      alert("Nothing to export — there are no wards on the bed map yet.");
      return;
    }
    printTable("Bed Map", EXPORT_COLUMNS, rowsFor(filteredWards));
  }

  async function importBeds(rws: string[][]): Promise<ImportResult> {
    const errors: string[] = [];
    let created = 0;
    for (let i = 0; i < rws.length; i++) {
      const r = rws[i];
      try {
        const res = await fetch("/api/beds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ward_id: r[0]?.trim(),
            bed_number: r[1]?.trim(),
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          errors.push(`Row ${i + 1}: ${body.error ?? "Failed to add bed"}`);
          continue;
        }
        created++;
      } catch (e) {
        errors.push(`Row ${i + 1}: ${e instanceof Error ? e.message : "Network error"}`);
      }
    }
    return { created, failed: errors.length, errors };
  }

  const rateOf = (w: WardDetail): number | null => w.ward_daily_rates?.[0]?.rate ?? null;

  const addBed = async (wardId: string) => {
    const bedNumber = (bedInputs[wardId] ?? "").trim();
    if (!bedNumber) return;
    setConfigBusy(true); setToast(null);
    try {
      const res = await fetch("/api/beds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ward_id: wardId, bed_number: bedNumber }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to add bed");
      setBedInputs((d) => ({ ...d, [wardId]: "" }));
      await refreshAll();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to add bed");
    } finally {
      setConfigBusy(false);
    }
  };

  const saveWard = async (data: { name: string; ward_type: string; is_active: boolean; rate: number | null }) => {
    setConfigBusy(true); setToast(null);
    try {
      let wardId = editingWard?.id ?? null;
      if (editingWard) {
        const res = await fetch(`/api/wards/${editingWard.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: data.name, ward_type: data.ward_type, is_active: data.is_active }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to update ward");
      } else {
        const res = await fetch("/api/wards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: data.name, ward_type: data.ward_type }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to create ward");
        wardId = body.data?.id ?? null;
      }
      if (wardId && data.rate != null) {
        const res = await fetch("/api/ward-rates", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ward_id: wardId, rate: data.rate }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to save daily rate");
      }
      setShowWardModal(false);
      setEditingWard(null);
      await refreshAll();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to save ward");
    } finally {
      setConfigBusy(false);
    }
  };

  const openEdit = (w: WardDetail) => {
    setEditingWard(w);
    setShowWardModal(true);
  };

  const openCreate = () => {
    setEditingWard(null);
    setShowWardModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-[var(--color-foreground)]">
              <MapPin className="h-5 w-5 text-[var(--color-primary)]" /> Bed Map
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
              Live ward layout. Updates automatically when a bed changes status.
              {managing && " Managing wards, beds and daily rates."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              <Satellite size={12} /> {connected ? "LIVE" : "POLLING"}
            </span>
            {canManage && !viewOnly && (
              <button
                type="button"
                onClick={() => setManaging((m) => !m)}
                className={`focus-ring inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors duration-200 ${
                  managing
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]"
                    : "border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-slate-50"
                }`}
              >
                <Pencil size={13} /> Manage
              </button>
            )}
            <button onClick={() => void refreshAll()} className={btnPrimary} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </button>
            <ImportExportMenu
              entityLabel="Beds & Occupancy"
              exportCsv={exportCsv}
              exportPdf={exportPdf}
              importColumns={IMPORT_COLUMNS}
              importSample={IMPORT_SAMPLE}
              templateFilename="beds-import-template.csv"
              onImport={importBeds}
              onImported={() => void refreshAll()}
              allowImport={!viewOnly}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-[var(--color-muted-fg)]">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Available {totals.available}</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Occupied {totals.occupied}</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Maintenance / cleaning {totals.other}</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <FilterBar
            query={search}
            onQueryChange={setSearch}
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
            onClear={() => { setSearch(""); setFrom(""); setTo(""); setStatusFilter(""); }}
            searchPlaceholder="Search ward, bed no, patient…"
            searchWidth={260}
          />
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by bed status">
            {[{ value: "", label: "All" }, { value: "available", label: "Available" }, { value: "occupied", label: "Occupied" }, { value: "maintenance", label: "Maintenance" }, { value: "cleaning", label: "Cleaning" }].map((s) => (
              <button
                key={s.value || "all"}
                type="button"
                onClick={() => setStatusFilter(s.value)}
                className={`focus-ring rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                  statusFilter === s.value
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]"
                    : "border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-slate-50"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {(from || to) && (
          <p className="mt-2 text-xs text-[var(--color-muted-fg)]">
            Occupancy is filtered to patients admitted within the selected period; vacant beds remain visible.
          </p>
        )}
        {toast && <p className="mt-3 text-xs text-rose-600">{toast}</p>}
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-[var(--color-muted-fg)]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : wards.length === 0 && !managing ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center text-sm text-[var(--color-muted-fg)]">
          No active wards yet. {canManage && "Open Manage to create your first ward."}
        </div>
      ) : filterActive && (managing ? filteredDetails : filteredWards).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center text-sm text-[var(--color-muted-fg)]">
          No beds match the current filters.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {(managing ? filteredDetails : filteredWards).map((w) => {
            const detail = managing ? (w as WardDetail) : null;
            const mapWard = managing ? filteredWards.find((x) => x.id === w.id) : (w as WardRow);
            const rate = detail ? rateOf(detail) : null;
            const beds = managing ? (detail?.beds ?? []) : (mapWard?.beds ?? []);
            return (
              <div key={w.id} className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-foreground)]">
                      <BedDouble className="h-4 w-4 text-[var(--color-primary)]" /> {w.name}
                    </h3>
                    <p className="text-xs text-[var(--color-muted-fg)] capitalize">
                      {w.ward_type ?? "general"} ward · {beds.length} seats
                      {managing && !(w as WardDetail).is_active && (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 font-semibold normal-case text-slate-500">inactive</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {managing && !viewOnly && (
                      <>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${rate ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                          title="Daily accommodation rate"
                        >
                          <Coins size={11} /> {rate ? `₦${Number(rate).toLocaleString()}/night` : "No rate"}
                        </span>
                        <button
                          type="button"
                          onClick={() => openEdit(w as WardDetail)}
                          disabled={configBusy}
                          className="focus-ring rounded-lg border border-[var(--color-border)] p-1.5 text-xs text-[var(--color-muted-fg)] transition-colors duration-200 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-60"
                          aria-label={`Edit ${w.name}`}
                          title="Edit ward"
                        >
                          <Pencil size={13} />
                        </button>
                      </>
                    )}
                    <Users size={16} className="text-[var(--color-muted-fg)]" />
                  </div>
                </div>

                {beds.length === 0 && !managing && (
                  <p className="py-4 text-center text-xs text-[var(--color-muted-fg)]">No beds in this ward.</p>
                )}
                {beds.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {beds.map((b: any) => (
                      <div key={b.id} className={`rounded-xl border p-3 ${statusCls[b.status] ?? statusCls.available}`}>
                        <p className="text-xs font-bold">Bed {b.bed_number ?? b.bedNumber}</p>
                        <p className="mt-0.5 text-[11px] capitalize">{b.status}</p>
                        {b.occupant && (
                          <p className="mt-1.5 text-[11px] font-semibold leading-tight">
                            {b.occupant.name}
                            <span className="block font-normal opacity-75">{b.occupant.patientNumber}</span>
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {managing && !viewOnly && (
                  <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-border)] pt-3">
                    <input
                      type="text"
                      placeholder={`New bed number (e.g. ${w.name.slice(0, 2).toUpperCase()}-07)`}
                      value={bedInputs[w.id] ?? ""}
                      onChange={(e) => setBedInputs((d) => ({ ...d, [w.id]: e.target.value }))}
                      className={`${inputCls} !h-8 text-xs`}
                      aria-label={`Bed number for ${w.name}`}
                    />
                    {addingBedTo === w.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void addBed(w.id)}
                          disabled={configBusy || !(bedInputs[w.id] ?? "").trim()}
                          className="focus-ring rounded-lg bg-emerald-500 p-1.5 text-white transition-colors duration-200 hover:bg-emerald-600 disabled:opacity-50"
                          aria-label="Confirm add bed"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddingBedTo(null)}
                          className="focus-ring rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-muted-fg)]"
                          aria-label="Cancel add bed"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setAddingBedTo(w.id); setBedInputs((d) => ({ ...d, [w.id]: d[w.id] ?? "" })); }}
                        className={btnGhost}
                      >
                        <Plus size={13} /> Add bed
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {managing && !viewOnly && (
            <button
              type="button"
              onClick={openCreate}
              className="focus-ring flex min-h-[120px] items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-white text-sm font-semibold text-[var(--color-muted-fg)] transition-colors duration-200 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              <Plus size={16} /> Add ward
            </button>
          )}
        </div>
      )}

      {showWardModal && (
        <WardModal
          ward={editingWard}
          busy={configBusy}
          onClose={() => { setShowWardModal(false); setEditingWard(null); }}
          onSave={saveWard}
        />
      )}
    </div>
  );
}

function WardModal({
  ward,
  busy,
  onClose,
  onSave,
}: {
  ward: WardDetail | null;
  busy: boolean;
  onClose: () => void;
  onSave: (data: { name: string; ward_type: string; is_active: boolean; rate: number | null }) => void;
}) {
  const [name, setName] = useState(ward?.name ?? "");
  const [wardType, setWardType] = useState(ward?.ward_type ?? "general");
  const [isActive, setIsActive] = useState(ward?.is_active ?? true);
  const [rate, setRate] = useState(ward?.ward_daily_rates?.[0]?.rate != null ? String(ward.ward_daily_rates[0].rate) : "");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) { setError("Ward name is required"); return; }
    const rateNum = rate.trim() === "" ? null : Number(rate);
    if (rate.trim() !== "" && (!Number.isFinite(rateNum) || (rateNum as number) < 0)) {
      setError("Daily rate must be a non-negative number");
      return;
    }
    onSave({ name: name.trim(), ward_type: wardType, is_active: isActive, rate: rateNum });
  };

  return (
    <ModalShell title={ward ? `Edit ${ward.name}` : "Add ward"} onClose={onClose}>
      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="ward-name" className={labelCls}>Ward name</label>
          <input
            id="ward-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Male Medical"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="ward-type" className={labelCls}>Ward type</label>
          <select
            id="ward-type"
            value={wardType}
            onChange={(e) => setWardType(e.target.value)}
            className={inputCls}
          >
            {WARD_TYPES.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ward-rate" className={labelCls}>Daily accommodation rate (₦) — used for discharge billing</label>
          <input
            id="ward-rate"
            type="number"
            min="0"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="e.g. 15000"
            className={inputCls}
          />
          <p className="mt-1 text-[11px] text-[var(--color-muted-fg)]">Leave empty to keep no rate — room charges only post when a rate is set.</p>
        </div>
        {ward && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-foreground)]">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
            />
            Active (visible on the bed map)
          </label>
        )}
        {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={btnGhost}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={busy} className={btnPrimary}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {ward ? "Save changes" : "Create ward"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}