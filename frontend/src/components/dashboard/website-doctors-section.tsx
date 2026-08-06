"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Stethoscope, Trash2 } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

interface LandingDoctor {
  id: string;
  name: string;
  specialty: string;
  available: boolean;
  availability: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

const emptyForm = {
  name: "",
  specialty: "",
  available: true,
  availability: "",
  image_url: "",
  sort_order: 0,
  is_active: true,
};

export default function WebsiteDoctorsSection() {
  const [doctors, setDoctors] = useState<LandingDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/landing/doctors", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load doctors");
      setDoctors(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load doctors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        specialty: form.specialty,
        available: form.available,
        availability: form.availability,
        image_url: form.image_url.trim() || null,
        sort_order: Number(form.sort_order) || 0,
      };
      const res = await fetch(
        editingId ? `/api/landing/doctors/${editingId}` : "/api/landing/doctors",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save doctor");
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save doctor");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(d: LandingDoctor) {
    setEditingId(d.id);
    setForm({
      name: d.name,
      specialty: d.specialty,
      available: d.available,
      availability: d.availability,
      image_url: d.image_url ?? "",
      sort_order: d.sort_order,
      is_active: d.is_active,
    });
    setShowForm(true);
  }

  async function toggleActive(d: LandingDoctor) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/landing/doctors/${d.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !d.is_active }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update doctor");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update doctor");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this doctor from the website?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/landing/doctors/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete doctor");
      if (editingId === id) {
        setEditingId(null);
        setShowForm(false);
        setForm(emptyForm);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete doctor");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Stethoscope size={16} aria-hidden="true" className="text-[var(--color-muted-fg)]" />
          <h2 className="text-sm font-semibold text-[var(--color-foreground)]">Website doctors</h2>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm(emptyForm);
              setShowForm(true);
            }}
            className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-foreground)] hover:bg-slate-50"
          >
            <Plus size={13} /> Add Doctor
          </button>
        )}
      </header>

      <div className="space-y-3 p-4">
        {error && (
          <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={18} aria-hidden="true" className="animate-spin text-[var(--color-muted-fg)]" />
          </div>
        ) : doctors.length === 0 && !showForm ? (
          <p className="py-4 text-center text-sm text-[var(--color-muted-fg)]">
            No doctors yet. Add one to show it on your public website.
          </p>
        ) : (
          <ul className="space-y-2">
            {doctors.map((d) => (
              <li
                key={d.id}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${d.is_active ? "border-[var(--color-border)]" : "border-[var(--color-border)] opacity-60"}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-xs font-semibold text-sky-700">
                    {d.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      d.name
                        .split(" ")
                        .map((s) => s[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">
                      {d.name}
                      {!d.is_active && (
                        <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                          Hidden
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-[var(--color-muted-fg)]">
                      {d.specialty}
                      {d.available ? " · Available" : " · Limited availability"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleActive(d)}
                    disabled={busy}
                    className={`focus-ring rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${d.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                  >
                    {d.is_active ? "Shown" : "Hidden"}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(d)}
                    disabled={busy}
                    className="focus-ring rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-slate-100 disabled:opacity-50"
                    aria-label={`Edit ${d.name}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(d.id)}
                    disabled={busy}
                    className="focus-ring rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-rose-50 hover:text-[var(--color-destructive)] disabled:opacity-50"
                    aria-label={`Delete ${d.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {showForm && (
          <form onSubmit={save} className="grid gap-3 rounded-lg border border-dashed border-[var(--color-border)] p-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="ld-name">Full name</label>
              <input id="ld-name" className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label className={labelCls} htmlFor="ld-specialty">Specialty</label>
              <input id="ld-specialty" className={inputCls} value={form.specialty} onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))} placeholder="e.g. Cardiologist" required />
            </div>
            <div>
              <label className={labelCls} htmlFor="ld-availability">Availability note (optional)</label>
              <input id="ld-availability" className={inputCls} value={form.availability} onChange={(e) => setForm((f) => ({ ...f, availability: e.target.value }))} placeholder="e.g. Mon–Fri, 9am–4pm" />
            </div>
            <div>
              <label className={labelCls} htmlFor="ld-image">Photo URL (optional)</label>
              <input id="ld-image" className={inputCls} value={form.image_url} onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))} placeholder="https://…" />
            </div>
            <div>
              <label className={labelCls} htmlFor="ld-order">Sort order</label>
              <input id="ld-order" type="number" className={inputCls} value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))} />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-[var(--color-foreground)] sm:pt-6">
              <input
                type="checkbox"
                checked={form.available}
                onChange={(e) => setForm((f) => ({ ...f, available: e.target.checked }))}
                className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
              />
              Available for booking
            </label>
            <div className="flex items-end gap-2 sm:col-span-2">
              <button type="submit" disabled={busy} className="focus-ring rounded-lg bg-[var(--color-primary)] px-3 py-2.5 text-sm font-medium text-white disabled:opacity-60">
                {busy ? "Saving…" : editingId ? "Save Changes" : "Add Doctor"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setForm(emptyForm);
                }}
                className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm font-medium text-[var(--color-muted-fg)] hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
