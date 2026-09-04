"use client";

import { useState, useCallback, useEffect } from "react";
import { Tag, Plus, Trash2, X, Pencil, Store, MapPin, Phone as PhoneIcon, Mail } from "lucide-react";
import type { AccessLevel } from "@/lib/nav";
import { flexBetween, labelSm, sectionTitle, mutedSmPlain, ghostIconBtn, modalBackdrop } from "@/lib/ui-constants";
import { inputCls, btnPrimary, btnGhost } from "./pharmacy-admin-shared";
import { PricesTab } from "./pharmacy-prices-tab";

// ---------------------------------------------------------------------------
// BRANCHES TAB
// ---------------------------------------------------------------------------
// Branch administration (prices + branch manager) lives on /app/pharmacy/prices
// â€” admin-gated, and the natural home for everything branch-related.
export function BranchAdminTabs({ accessLevel = "full", myRole }: { accessLevel?: AccessLevel; myRole?: string }) {
  const viewOnly = accessLevel === "view_only";
  const [tab, setTab] = useState<"prices" | "branches">("prices");

  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="group" aria-label="Branch administration">
        <button
          type="button"
          onClick={() => setTab("prices")}
          aria-pressed={tab === "prices"}
          className={`focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors duration-200 ${
            tab === "prices" ? "bg-[var(--color-primary)] text-white" : "border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-slate-50"
          }`}
        >
          <Tag size={14} aria-hidden="true" /> Branch prices
        </button>
        <button
          type="button"
          onClick={() => setTab("branches")}
          aria-pressed={tab === "branches"}
          className={`focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors duration-200 ${
            tab === "branches" ? "bg-[var(--color-primary)] text-white" : "border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-slate-50"
          }`}
        >
          <Store size={14} aria-hidden="true" /> Branches
        </button>
      </div>
      {tab === "prices" ? <PricesTab viewOnly={viewOnly} /> : <BranchesTab viewOnly={viewOnly} />}
    </div>
  );
}

interface BranchRow {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  isMain: boolean;
  isActive: boolean;
}

export function BranchesTab({ viewOnly = false }: { viewOnly?: boolean }) {
  const [rows, setRows] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<{ open: true; branch: BranchRow | null } | { open: false }>({ open: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pharmacy/admin/branches", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load branches");
      setRows(body.data ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load branches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(form: FormData) {
    const payload: Record<string, unknown> = { name: String(form.get("name") ?? "").trim() };
    for (const k of ["code", "address", "city", "state", "phone", "email"] as const) {
      const v = String(form.get(k) ?? "").trim();
      if (v) payload[k] = v;
    }
    const editing = modal.open && modal.branch;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        editing ? `/api/pharmacy/admin/branches/${editing.id}` : "/api/pharmacy/admin/branches",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save branch");
      setModal({ open: false });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save branch");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(b: BranchRow) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/pharmacy/admin/branches/${b.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !b.isActive }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update branch");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to update branch");
    } finally {
      setBusy(false);
    }
  }

  async function remove(b: BranchRow) {
    if (
      !confirm(
        `Delete branch "${b.name}"?\n\nStaff assigned to it become branchless and its stock / price rows are removed. This cannot be undone.`
      )
    )
      return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/pharmacy/admin/branches/${b.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete branch");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to delete branch");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={mutedSmPlain}>
          Branch staff only see their branch&apos;s stock and prices. The main branch always stays.
        </p>
        {!viewOnly && (
        <button
          type="button"
          onClick={() => setModal({ open: true, branch: null })}
          disabled={busy}
          className={btnPrimary}
        >
          <Plus size={14} aria-hidden="true" /> Add branch
        </button>
        )}
      </div>

      {err && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
        >
          {err}
        </p>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-[var(--color-muted-fg)]">Loading branchesâ€¦</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-12 text-center shadow-[var(--shadow-sm)]">
          <Store size={36} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className={sectionTitle}>
            No branches yet â€” add your first one.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((b) => (
            <div
              key={b.id}
              className={`rounded-2xl border bg-white p-4 shadow-[var(--shadow-sm)] transition-colors duration-200 ${
                b.isActive ? "border-[var(--color-border)]" : "border-dashed opacity-70"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[var(--color-primary-dark)]">
                    <Store size={16} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--color-foreground)]">{b.name}</p>
                    <p className="text-[11px] text-[var(--color-muted-fg)]">
                      {b.isMain ? (
                        <span className="font-semibold text-[var(--color-primary-dark)]">Main branch</span>
                      ) : b.code ? (
                        b.code
                      ) : (
                        "Branch"
                      )}
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    b.isActive
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-100 text-slate-500"
                  }`}
                >
                  {b.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              {(b.address || b.city || b.state) && (
                <div className="mt-3 flex items-start gap-1.5 text-xs text-[var(--color-muted-fg)]">
                  <MapPin size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    {[b.address, b.city, b.state].filter(Boolean).join(", ")}
                  </span>
                </div>
              )}
              {b.phone && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-muted-fg)]">
                  <PhoneIcon size={12} aria-hidden="true" className="shrink-0" />
                  <a href={`tel:${b.phone}`} className="hover:underline">{b.phone}</a>
                </div>
              )}
              {b.email && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-muted-fg)]">
                  <Mail size={12} aria-hidden="true" className="shrink-0" />
                  <a href={`mailto:${b.email}`} className="truncate hover:underline">{b.email}</a>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                {!viewOnly && (
                <>
                <button
                  type="button"
                  onClick={() => setModal({ open: true, branch: b })}
                  disabled={busy}
                  className={btnGhost}
                >
                  <Pencil size={12} aria-hidden="true" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => void toggle(b)}
                  disabled={busy}
                  className={btnGhost}
                >
                  {b.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(b)}
                  disabled={busy || b.isMain}
                  title={b.isMain ? "The main branch cannot be deleted" : "Delete branch"}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-red-600 transition-colors duration-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 size={12} aria-hidden="true" /> Delete
                </button>
                </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <div
          className={modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={modal.branch ? `Edit ${modal.branch.name}` : "Add branch"}
        >
          <div className="my-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className={flexBetween}>
              <h3 className="text-lg font-bold">{modal.branch ? `Edit â€” ${modal.branch.name}` : "Add branch"}</h3>
              <button
                type="button"
                onClick={() => setModal({ open: false })}
                className={ghostIconBtn}
                aria-label="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submit(new FormData(e.currentTarget));
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelSm} htmlFor="b-name">
                    Branch name
                  </label>
                  <input
                    id="b-name"
                    name="name"
                    required
                    maxLength={120}
                    className={inputCls}
                    defaultValue={modal.branch?.name ?? ""}
                    placeholder="e.g. Victoria Island Pharmacy"
                  />
                </div>
                <div>
                  <label className={labelSm} htmlFor="b-code">
                    Code
                  </label>
                  <input
                    id="b-code"
                    name="code"
                    className={inputCls}
                    defaultValue={modal.branch?.code ?? ""}
                    placeholder="e.g. VI"
                  />
                </div>
                <div>
                  <label className={labelSm} htmlFor="b-phone">
                    Phone
                  </label>
                  <input
                    id="b-phone"
                    name="phone"
                    className={inputCls}
                    defaultValue={modal.branch?.phone ?? ""}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelSm} htmlFor="b-address">
                    Address
                  </label>
                  <input
                    id="b-address"
                    name="address"
                    className={inputCls}
                    defaultValue={modal.branch?.address ?? ""}
                  />
                </div>
                <div>
                  <label className={labelSm} htmlFor="b-city">
                    City
                  </label>
                  <input
                    id="b-city"
                    name="city"
                    className={inputCls}
                    defaultValue={modal.branch?.city ?? ""}
                  />
                </div>
                <div>
                  <label className={labelSm} htmlFor="b-state">
                    State
                  </label>
                  <input
                    id="b-state"
                    name="state"
                    className={inputCls}
                    defaultValue={modal.branch?.state ?? ""}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelSm} htmlFor="b-email">
                    Email
                  </label>
                  <input
                    id="b-email"
                    name="email"
                    type="email"
                    className={inputCls}
                    defaultValue={modal.branch?.email ?? ""}
                  />
                </div>
              </div>
              {err && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                >
                  {err}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setModal({ open: false })}
                  className={btnGhost + " flex-1 justify-center"}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className={btnPrimary + " flex-1 justify-center"}
                >
                  {busy ? "Savingâ€¦" : modal.branch ? "Save changes" : "Create branch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}