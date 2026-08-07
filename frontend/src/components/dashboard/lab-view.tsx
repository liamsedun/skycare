"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Plus, TestTube } from "lucide-react";

interface LabTest {
  id: string;
  name: string;
  category: string | null;
  price: number;
  reference_range: string | null;
  is_active: boolean;
}

interface LabOrder {
  id: string;
  status: string;
  requested_at: string;
  notes: string | null;
  patients: { id: string; patient_number: string; first_name: string; last_name: string } | null;
  users: { full_name: string } | null;
  lab_order_tests: Array<{
    id: string;
    test_name: string;
    sample_type: string | null;
    priority: string;
    lab_results: Array<{ id: string; result: string | null; unit: string | null; is_abnormal: boolean }>;
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

export default function LabView({ canManageCatalog, canEnterResults }: { canManageCatalog: boolean; canEnterResults: boolean }) {
  const router = useRouter();
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (filter !== "all") params.set("status", filter);
      const res = await fetch(`/api/lab-orders?${params.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load lab orders");
      setOrders(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lab orders");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const viewed = viewId ? orders.find((o) => o.id === viewId) ?? null : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
            Laboratory
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
            Lab orders, samples and results.
          </p>
        </div>
        <div className="flex gap-2">
          {canManageCatalog && (
            <button
              type="button"
              onClick={() => setShowCatalog(true)}
              className="focus-ring inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--color-foreground)] transition-colors duration-200 hover:border-[var(--color-primary)]"
            >
              <TestTube size={16} aria-hidden="true" /> Test Catalog
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]"
          >
            <Plus size={16} aria-hidden="true" /> New Lab Order
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter lab orders">
        {STATUS_FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            aria-pressed={filter === item}
            className={`focus-ring rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-colors duration-200 ${
              filter === item
                ? "bg-[var(--color-primary)] text-white"
                : "bg-white text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
            }`}
          >
            {item.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading lab orders…</p>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <FlaskConical size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">No lab orders found.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => (
            <div key={order.id} className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--color-foreground)]">
                    {order.patients ? `${order.patients.first_name} ${order.patients.last_name}` : "Unknown"}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
                    {order.patients?.patient_number ?? ""} · {new Date(order.requested_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClass(order.status)}`}>
                  {order.status.replace(/_/g, " ")}
                </span>
              </div>
              <p className="mt-3 text-xs text-[var(--color-muted-fg)]">
                {order.lab_order_tests.map((t) => t.test_name).join(", ")}
              </p>
              <button
                type="button"
                onClick={() => setViewId(order.id)}
                className="focus-ring mt-3 w-full rounded-lg border border-[var(--color-border)] py-2 text-xs font-semibold text-[var(--color-primary)] transition-colors duration-200 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
              >
                View / enter results
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateOrderModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
            router.refresh();
          }}
        />
      )}

      {viewed && (
        <OrderDetailModal
          order={viewed}
          canEnterResults={canEnterResults}
          onClose={() => setViewId(null)}
          onChanged={() => {
            load();
            router.refresh();
          }}
        />
      )}

      {showCatalog && canManageCatalog && (
        <CatalogModal
          onClose={() => setShowCatalog(false)}
          onChanged={() => {
            load();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function CreateOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patients, setPatients] = useState<{ id: string; label: string }[]>([]);
  const [tests, setTests] = useState<LabTest[]>([]);
  const [selected, setSelected] = useState<Record<string, { sampleType: string; priority: string }>>({});

  useEffect(() => {
    (async () => {
      try {
        const [patientRes, testRes] = await Promise.all([
          fetch("/api/patients?pageSize=100", { cache: "no-store" }),
          fetch("/api/lab-tests?pageSize=100", { cache: "no-store" }),
        ]);
        const patientBody = await patientRes.json();
        const testBody = await testRes.json();
        setPatients(
          (patientBody.data ?? []).map((p: { id: string; first_name: string; last_name: string; patient_number: string }) => ({
            id: p.id,
            label: `${p.first_name} ${p.last_name} (${p.patient_number})`,
          }))
        );
        setTests((testBody.data ?? []).filter((t: LabTest) => t.is_active));
      } catch {
        /* options non-critical */
      }
    })();
  }, []);

  async function handleSubmit(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const orderTests = Object.entries(selected).map(([testId, opts]) => {
        const test = tests.find((t) => t.id === testId);
        return {
          testId,
          testName: test?.name ?? testId,
          sampleType: opts.sampleType || undefined,
          priority: opts.priority || "routine",
        };
      });
      const res = await fetch("/api/lab-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: form.get("patientId"),
          notes: (form.get("notes") as string) || undefined,
          tests: orderTests,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create lab order");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create lab order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="New Lab Order" onClose={onClose}>
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(new FormData(e.currentTarget));
        }}
      >
        <div>
          <label className={labelCls} htmlFor="lo-patient">Patient</label>
          <select id="lo-patient" name="patientId" required className={inputCls}>
            <option value="">Select patient…</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        <div>
          <span className="mb-2 block text-sm font-semibold text-[var(--color-foreground)]">
            Tests ({Object.keys(selected).length} selected)
          </span>
          {tests.length === 0 ? (
            <p className="rounded-lg bg-[var(--color-muted)]/40 px-3 py-2 text-xs text-[var(--color-muted-fg)]">
              No active tests in the catalog. Ask an admin to add tests first.
            </p>
          ) : (
            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-[var(--color-border)] p-2">
              {tests.map((test) => (
                <label
                  key={test.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150 ${
                    selected[test.id] ? "bg-[var(--color-primary-soft)]" : "hover:bg-[var(--color-muted)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!selected[test.id]}
                    onChange={(e) => {
                      const next = { ...selected };
                      if (e.target.checked) next[test.id] = { sampleType: "", priority: "routine" };
                      else delete next[test.id];
                      setSelected(next);
                    }}
                    className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
                  />
                  <span className="flex-1">
                    <span className="font-medium text-[var(--color-foreground)]">{test.name}</span>
                    <span className="ml-2 text-xs text-[var(--color-muted-fg)]">
                      {test.category ?? ""} · ₦{Number(test.price).toLocaleString()}
                    </span>
                    {selected[test.id] && (
                      <span className="mt-1 flex gap-2">
                        <input
                          type="text"
                          placeholder="Sample type (e.g. blood)"
                          value={selected[test.id].sampleType}
                          onChange={(e) =>
                            setSelected({ ...selected, [test.id]: { ...selected[test.id], sampleType: e.target.value } })
                          }
                          className={`${inputCls} !py-1 text-xs`}
                        />
                        <select
                          value={selected[test.id].priority}
                          onChange={(e) =>
                            setSelected({ ...selected, [test.id]: { ...selected[test.id], priority: e.target.value } })
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
          )}
        </div>

        <div>
          <label className={labelCls} htmlFor="lo-notes">Notes (optional)</label>
          <textarea id="lo-notes" name="notes" rows={2} className={inputCls} />
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
            {busy ? "Creating…" : "Create lab order"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function OrderDetailModal({
  order,
  canEnterResults,
  onClose,
  onChanged,
}: {
  order: LabOrder;
  canEnterResults: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { result: string; unit: string; isAbnormal: boolean }>>({});

  async function updateStatus(status: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/lab-orders/${order.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update order");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update order");
    } finally {
      setBusy(false);
    }
  }

  async function saveResults() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/lab-orders/${order.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results: Object.entries(results).map(([orderTestId, r]) => ({
            orderTestId,
            result: r.result || undefined,
            unit: r.unit || undefined,
            isAbnormal: r.isAbnormal,
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save results");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save results");
    } finally {
      setBusy(false);
    }
  }

  const canWork = ["requested", "sample_collected", "in_progress"].includes(order.status);

  return (
    <ModalShell
      title={`Lab order — ${order.patients ? `${order.patients.first_name} ${order.patients.last_name}` : ""}`}
      onClose={onClose}
      wide
    >
      <div className="mt-5 space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(order.status)}`}>
            {order.status.replace(/_/g, " ")}
          </span>
          <span className="text-sm text-[var(--color-muted-fg)]">
            Requested {new Date(order.requested_at).toLocaleString()} {order.users ? `· by ${order.users.full_name}` : ""}
          </span>
          {canWork && canEnterResults && order.status === "requested" && (
            <button
              type="button"
              onClick={() => updateStatus("sample_collected")}
              disabled={busy}
              className="focus-ring ml-auto rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)] disabled:opacity-60"
            >
              Sample collected
            </button>
          )}
          {canWork && canEnterResults && order.status === "sample_collected" && (
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
                if (!confirm("Cancel this lab order?")) return;
                updateStatus("cancelled");
              }}
              disabled={busy}
              className="focus-ring rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              Cancel
            </button>
          )}
        </div>

        {order.notes && (
          <p className="text-sm text-[var(--color-muted-fg)]">
            <span className="font-semibold text-[var(--color-foreground)]">Notes: </span>
            {order.notes}
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
                <th scope="col" className="px-4 py-2.5 font-semibold">Test</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Priority</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Result</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Unit</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Abnormal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {order.lab_order_tests.map((test) => {
                const existing = test.lab_results[0];
                const current = results[test.id] ?? {
                  result: existing?.result ?? "",
                  unit: existing?.unit ?? "",
                  isAbnormal: existing?.is_abnormal ?? false,
                };
                return (
                  <tr key={test.id}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-[var(--color-foreground)]">{test.test_name}</p>
                      <p className="text-xs text-[var(--color-muted-fg)]">{test.sample_type ?? ""}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs capitalize text-[var(--color-muted-fg)]">{test.priority}</td>
                    <td className="px-4 py-2.5">
                      {canEnterResults ? (
                        <input
                          type="text"
                          value={current.result}
                          onChange={(e) =>
                            setResults({ ...results, [test.id]: { ...current, result: e.target.value } })
                          }
                          placeholder={existing?.result ? existing.result : "Result…"}
                          className={`${inputCls} !py-1.5 text-xs`}
                        />
                      ) : (
                        <span className="text-[var(--color-foreground)]">{current.result || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {canEnterResults ? (
                        <input
                          type="text"
                          value={current.unit}
                          onChange={(e) =>
                            setResults({ ...results, [test.id]: { ...current, unit: e.target.value } })
                          }
                          placeholder="Unit…"
                          className={`${inputCls} !py-1.5 text-xs`}
                        />
                      ) : (
                        <span className="text-[var(--color-muted-fg)]">{current.unit || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {canEnterResults ? (
                        <input
                          type="checkbox"
                          checked={current.isAbnormal}
                          onChange={(e) =>
                            setResults({ ...results, [test.id]: { ...current, isAbnormal: e.target.checked } })
                          }
                          className="h-4 w-4 accent-red-500"
                          aria-label={`Mark ${test.test_name} abnormal`}
                        />
                      ) : (
                        <span className={current.isAbnormal ? "font-semibold text-red-600" : "text-[var(--color-muted-fg)]"}>
                          {current.isAbnormal ? "Yes" : "No"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {canEnterResults && canWork && (
          <button
            type="button"
            onClick={saveResults}
            disabled={busy}
            className="focus-ring w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save results & mark completed"}
          </button>
        )}
      </div>
    </ModalShell>
  );
}

function CatalogModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<LabTest[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState(0);
  const [range, setRange] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/lab-tests?pageSize=100", { cache: "no-store" });
      const body = await res.json();
      if (res.ok) setTests(body.data ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addTest(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lab-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category: category || undefined, price, referenceRange: range || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to add test");
      setName("");
      setCategory("");
      setPrice(0);
      setRange("");
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add test");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTest(test: LabTest) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/lab-tests/${test.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !test.is_active }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update test");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update test");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Test Catalog" onClose={onClose} wide>
      <div className="mt-5 space-y-5">
        <form onSubmit={addTest} className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4 sm:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Test name (e.g. Malaria RDT)" required className={inputCls} />
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (e.g. chemistry)" className={inputCls} />
          <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(Number(e.target.value))} placeholder="Price (₦)" className={inputCls} />
          <input value={range} onChange={(e) => setRange(e.target.value)} placeholder="Reference range" className={inputCls} />
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className="focus-ring w-full rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60">
              {busy ? "Adding…" : "Add test"}
            </button>
          </div>
        </form>

        {error && (
          <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
            {error}
          </p>
        )}

        <ul className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)]">
          {tests.map((test) => (
            <li key={test.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className={`font-medium ${test.is_active ? "text-[var(--color-foreground)]" : "text-[var(--color-muted-fg)] line-through"}`}>
                  {test.name}
                </p>
                <p className="text-xs text-[var(--color-muted-fg)]">
                  {test.category ?? "—"} · ₦{Number(test.price).toLocaleString()}
                  {test.reference_range ? ` · ${test.reference_range}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggleTest(test)}
                disabled={busy}
                className={`focus-ring shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  test.is_active
                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    : "bg-[var(--color-muted)] text-[var(--color-muted-fg)] hover:bg-slate-200"
                }`}
              >
                {test.is_active ? "Active" : "Inactive"}
              </button>
            </li>
          ))}
        </ul>
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
