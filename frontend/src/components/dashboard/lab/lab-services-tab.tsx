"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckSquare, Eye, ListChecks, Loader2, Pencil, Search, Square, TestTube, Trash2 } from "lucide-react";
import { ActionDropdown } from "@/components/ui/action-dropdown";
import { btnBase, divideBorder, errorBanner, fgMedium, mutedXs, mutedXsMt1, sectionTitle } from "@/lib/ui-constants";
import { useCurrency, currencySymbol } from "@/lib/currency";
import { LabService, approvalBadge, inputCls, labelCls } from "./lab-shared";
import { ModalShell } from "./lab-modal-shell";

// ---------------------------------------------------------------------------
// SERVICES TAB — catalog grouped by category with search, edit and approval
// ---------------------------------------------------------------------------
export function ServicesTab({
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
  const { currency } = useCurrency();
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
        <p role="alert" className={errorBanner}>
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
          <p className={sectionTitle}>
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
                <ul className={divideBorder}>
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
                        <p className={mutedXs}>
                          {s.type} · {currencySymbol(currency)}{Number(s.price).toLocaleString()}
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
  const { currency } = useCurrency();
  return (
    <ModalShell title={service.name} onClose={onClose}>
      <div className="mt-5 space-y-4 text-sm">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <dt className={mutedXs}>Type</dt>
            <dd className="font-medium capitalize text-[var(--color-foreground)]">{service.type}</dd>
          </div>
          <div>
            <dt className={mutedXs}>Price</dt>
            <dd className={fgMedium}>{currencySymbol(currency)}{Number(service.price).toLocaleString()}</dd>
          </div>
          <div>
            <dt className={mutedXs}>Group / category</dt>
            <dd className={fgMedium}>{service.lab_categories?.name ?? "Uncategorized"}</dd>
          </div>
          <div>
            <dt className={mutedXs}>Availability</dt>
            <dd className={`font-medium ${service.is_active ? "text-emerald-600" : "text-[var(--color-muted-fg)]"}`}>
              {service.is_active ? "Active" : "Inactive"}
            </dd>
          </div>
          <div>
            <dt className={mutedXs}>Reference range</dt>
            <dd className={fgMedium}>{service.reference_range ?? "—"}</dd>
          </div>
          <div>
            <dt className={mutedXs}>External lab ID</dt>
            <dd className={fgMedium}>{service.external_lab_id ?? "—"}</dd>
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
  const { currency } = useCurrency();

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
            <label className={labelCls} htmlFor="edit-price">Amount ({currencySymbol(currency)})</label>
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
            <p className={mutedXsMt1}>
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
          <p role="alert" className={errorBanner}>
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
  const { currency } = useCurrency();

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
          <p className={mutedXs}>
            {changed.length} changed · {rows.length} shown
          </p>
        </div>

        <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="sticky top-0 bg-[var(--color-muted)]">
              <tr className="text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                <th scope="col" className={btnBase}>Service</th>
                <th scope="col" className={btnBase}>Group</th>
                <th scope="col" className={btnBase}>Current</th>
                <th scope="col" className={btnBase}>Amount ({currencySymbol(currency)})</th>
              </tr>
            </thead>
            <tbody className={divideBorder}>
              {rows.map((s) => {
                const edited = Number(prices[s.id] ?? 0) !== Number(s.price ?? 0);
                return (
                  <tr key={s.id} className={edited ? "bg-[var(--color-primary-soft)]/50" : undefined}>
                    <td className="px-4 py-2">
                      <p className={`font-medium ${s.is_active ? "text-[var(--color-foreground)]" : "text-[var(--color-muted-fg)]"}`}>
                        {s.name}
                      </p>
                      <p className={mutedXs}>
                        {s.type} · {s.approval_status}
                      </p>
                    </td>
                    <td className="px-4 py-2 text-xs text-[var(--color-muted-fg)]">
                      {s.lab_categories?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-[var(--color-muted-fg)]">
                      {currencySymbol(currency)}{Number(s.price ?? 0).toLocaleString()}
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
          <p role="alert" className={errorBanner}>
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
export function AddServiceModal({ canManageCatalog, onClose, onAdded }: { canManageCatalog: boolean; onClose: () => void; onAdded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const { currency } = useCurrency();

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
            <label className={labelCls} htmlFor="svc-price">Price ({currencySymbol(currency)})</label>
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
          <p role="alert" className={errorBanner}>
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