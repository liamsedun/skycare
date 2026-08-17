"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Stethoscope,
  Trash2,
} from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";
const cardCls =
  "flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-white p-3";
const chipCls =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";

const ICON_OPTIONS = [
  "stethoscope",
  "heart",
  "flask",
  "pill",
  "syringe",
  "baby",
  "ambulance",
  "scissors",
  "microscope",
  "activity",
];

interface CmsItem {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  image_url: string | null;
  display_order: number;
  active: boolean;
}

interface PageRow {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  updated_at: string;
}

type TabKey = "services" | "departments" | "pages";

export default function WebsiteCmsSection() {
  const [tab, setTab] = useState<TabKey>("services");
  const [services, setServices] = useState<CmsItem[]>([]);
  const [departments, setDepartments] = useState<CmsItem[]>([]);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, d, p] = await Promise.all([
        fetch("/api/website/services", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/website/departments", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/website/pages", { cache: "no-store" }).then((r) => r.json()),
      ]);
      for (const res of [s, d, p]) {
        if (!res.ok && res.error) throw new Error(res.error);
      }
      setServices(s.data ?? []);
      setDepartments(d.data ?? []);
      setPages(p.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load website content");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "services", label: "Services", count: services.length },
    { key: "departments", label: "Departments", count: departments.length },
    { key: "pages", label: "Pages", count: pages.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)]/10 p-1 text-sm">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
              tab === t.key
                ? "bg-[var(--color-primary)] text-white shadow-sm"
                : "text-[var(--color-muted-fg)] hover:text-[var(--color-foreground)]"
            }`}
          >
            {t.label}
            <span className="ml-1 opacity-70">{t.count}</span>
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--color-muted-fg)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : tab === "services" ? (
        <CmsManager
          kind="services"
          rows={services}
          onSaved={loadAll}
          onError={setError}
        />
      ) : tab === "departments" ? (
        <CmsManager
          kind="departments"
          rows={departments}
          onSaved={loadAll}
          onError={setError}
        />
      ) : (
        <PagesManager rows={pages} onSaved={loadAll} onError={setError} />
      )}
    </div>
  );
}

function CmsManager({
  kind,
  rows,
  onSaved,
  onError,
}: {
  kind: "services" | "departments";
  rows: CmsItem[];
  onSaved: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CmsItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    icon: "",
    display_order: 0,
    active: true,
  });

  const api = kind === "services" ? "/api/website/services" : "/api/website/departments";
  const noun = kind === "services" ? "service" : "department";

  function startAdd() {
    setEditing(null);
    setForm({ name: "", description: "", icon: "", display_order: rows.length, active: true });
    setShowForm(true);
  }

  function startEdit(r: CmsItem) {
    setEditing(r);
    setForm({
      name: r.name,
      description: r.description ?? "",
      icon: r.icon ?? "",
      display_order: r.display_order,
      active: r.active,
    });
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    try {
      const res = await fetch(editing ? `${api}/${editing.id}` : api, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description.trim() || null,
          icon: form.icon || null,
          display_order: Number(form.display_order) || 0,
          active: form.active,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Failed to save ${noun}`);
      setShowForm(false);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : `Failed to save ${noun}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(r: CmsItem) {
    onError(null);
    try {
      const res = await fetch(`${api}/${r.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !r.active }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Failed to update ${noun}`);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : `Failed to update ${noun}`);
    }
  }

  async function remove(r: CmsItem) {
    if (!confirm(`Remove "${r.name}" from your website?`)) return;
    onError(null);
    try {
      const res = await fetch(`${api}/${r.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Failed to delete ${noun}`);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : `Failed to delete ${noun}`);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-muted-fg)]">
          Shown on your public website&apos;s {kind === "services" ? "services" : "departments"} grid.
        </p>
        <button
          type="button"
          onClick={startAdd}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add {noun}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] py-10 text-[var(--color-muted-fg)]">
          <Layers className="h-8 w-8 opacity-50" />
          <p className="text-sm">No {kind} yet. Add your first {noun}.</p>
        </div>
      ) : (
        rows.map((r) => (
          <div key={r.id} className={cardCls}>
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                {r.icon ? (
                  <span className="text-lg">{iconGlyph(r.icon)}</span>
                ) : (
                  <Stethoscope className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">
                    {r.name}
                  </p>
                  <span
                    className={`${chipCls} ${
                      r.active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {r.active ? "Active" : "Hidden"}
                  </span>
                </div>
                <p className="truncate text-xs text-[var(--color-muted-fg)]">
                  #{r.display_order}
                  {r.description ? ` · ${r.description}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => toggleActive(r)}
                className="rounded-md px-2 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
              >
                {r.active ? "Hide" : "Show"}
              </button>
              <button
                type="button"
                onClick={() => startEdit(r)}
                className="rounded-md p-1.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)]"
                aria-label="Edit"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(r)}
                className="rounded-md p-1.5 text-[var(--color-muted-fg)] hover:bg-rose-50 hover:text-rose-600"
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))
      )}

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !busy && setShowForm(false)}
        >
          <form
            onSubmit={save}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-xl"
          >
            <h3 className="text-base font-semibold text-[var(--color-foreground)]">
              {editing ? `Edit ${noun}` : `Add ${noun}`}
            </h3>
            <div>
              <label className={labelCls}>Name *</label>
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={kind === "services" ? "e.g. General Consultation" : "e.g. Cardiology"}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <textarea
                className={`${inputCls} min-h-[80px] resize-y`}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="A short line shown on the website"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Icon</label>
                <select
                  className={inputCls}
                  value={form.icon}
                  onChange={(e) => setForm({ ...form, icon: e.target.value })}
                >
                  <option value="">Default</option>
                  {ICON_OPTIONS.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Order</label>
                <input
                  type="number"
                  className={inputCls}
                  value={form.display_order}
                  onChange={(e) =>
                    setForm({ ...form, display_order: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--color-foreground)]">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              Visible on the website
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                disabled={busy}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-foreground)] hover:bg-black/[0.03]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Save changes" : `Add ${noun}`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function PagesManager({
  rows,
  onSaved,
  onError,
}: {
  rows: PageRow[];
  onSaved: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [editing, setEditing] = useState<PageRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ title: string; paragraphs: string; published: boolean }>({
    title: "",
    paragraphs: "",
    published: true,
  });

  async function open(r: PageRow) {
    onError(null);
    try {
      const res = await fetch(`/api/website/pages/${r.slug}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load page");
      const content = body.data?.content ?? {};
      setForm({
        title: body.data?.title ?? r.title,
        paragraphs: Array.isArray(content.paragraphs) ? content.paragraphs.join("\n") : "",
        published: body.data?.published ?? true,
      });
      setEditing(r);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to load page");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    onError(null);
    try {
      const res = await fetch(`/api/website/pages/${editing.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          content: {
            paragraphs: form.paragraphs
              .split("\n")
              .map((p) => p.trim())
              .filter(Boolean),
          },
          published: form.published,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save page");
      setEditing(null);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to save page");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--color-muted-fg)]">
        Content pages on your website. Each page is one paragraph per line.
      </p>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] py-10 text-[var(--color-muted-fg)]">
          <FileText className="h-8 w-8 opacity-50" />
          <p className="text-sm">No CMS pages yet.</p>
        </div>
      ) : (
        rows.map((r) => (
          <div key={r.id} className={cardCls}>
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">
                    {r.title}
                  </p>
                  <span
                    className={`${chipCls} ${
                      r.published
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {r.published ? "Published" : "Draft"}
                  </span>
                </div>
                <p className="truncate text-xs text-[var(--color-muted-fg)]">
                  /{r.slug} · updated {new Date(r.updated_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => open(r)}
              className="shrink-0 rounded-md p-1.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)]"
              aria-label="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        ))
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !busy && setEditing(null)}
        >
          <form
            onSubmit={save}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-xl"
          >
            <h3 className="text-base font-semibold text-[var(--color-foreground)]">
              Edit page <span className="text-[var(--color-muted-fg)]">/{editing.slug}</span>
            </h3>
            <div>
              <label className={labelCls}>Title *</label>
              <input
                className={inputCls}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Content (one paragraph per line)</label>
              <textarea
                className={`${inputCls} min-h-[140px] resize-y`}
                value={form.paragraphs}
                onChange={(e) => setForm({ ...form, paragraphs: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--color-foreground)]">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => setForm({ ...form, published: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              Published (visible on the website)
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={busy}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-foreground)] hover:bg-black/[0.03]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Save page
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function iconGlyph(key: string): string {
  const map: Record<string, string> = {
    stethoscope: "🩺",
    heart: "❤️",
    flask: "🧪",
    pill: "💊",
    syringe: "💉",
    baby: "👶",
    ambulance: "🚑",
    scissors: "✂️",
    microscope: "🔬",
    activity: "📈",
  };
  return map[key] ?? "🏥";
}
