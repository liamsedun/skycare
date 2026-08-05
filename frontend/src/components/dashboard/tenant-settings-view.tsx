"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Hash, Palette, Save } from "lucide-react";
import { DEFAULT_TENANT_SETTINGS, PREFIX_PATTERN } from "@/lib/tenant-settings";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

interface SettingsPayload {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  brand_color: string;
  currency: string;
  timezone: string;
  settings: {
    patientPrefix?: string;
    dependantPrefix?: string;
    staffPrefix?: string;
    invoicePrefix?: string;
    smsProvider?: string | null;
    labAutoFill?: boolean;
  };
}

export default function TenantSettingsView() {
  const [form, setForm] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tenant-settings", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load settings");
      const d = body.data;
      const s = d.settings ?? {};
      setForm({
        name: d.name ?? "",
        email: d.email ?? null,
        phone: d.phone ?? null,
        address: d.address ?? null,
        city: d.city ?? null,
        state: d.state ?? null,
        country: d.country ?? "Nigeria",
        brand_color: d.brand_color ?? "#0ea5e9",
        currency: d.currency ?? "NGN",
        timezone: d.timezone ?? "Africa/Lagos",
        settings: {
          patientPrefix: s.patientPrefix ?? DEFAULT_TENANT_SETTINGS.patientPrefix,
          dependantPrefix: s.dependantPrefix ?? DEFAULT_TENANT_SETTINGS.dependantPrefix,
          staffPrefix: s.staffPrefix ?? DEFAULT_TENANT_SETTINGS.staffPrefix,
          invoicePrefix: s.invoicePrefix ?? DEFAULT_TENANT_SETTINGS.invoicePrefix,
          smsProvider: s.smsProvider ?? null,
          labAutoFill: s.labAutoFill === true,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      for (const key of ["patientPrefix", "dependantPrefix", "staffPrefix", "invoicePrefix"] as const) {
        const v = (form.settings[key] ?? "").trim();
        if (!PREFIX_PATTERN.test(v)) {
          throw new Error(`${key} must be letters, numbers, - or _ (max 12 chars)`);
        }
      }
      const res = await fetch("/api/tenant-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: {
            name: form.name,
            email: form.email,
            phone: form.phone,
            address: form.address,
            city: form.city,
            state: form.state,
            country: form.country,
            brand_color: form.brand_color,
            currency: form.currency,
            timezone: form.timezone,
          },
          settings: form.settings,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save settings");
      setSuccess("Settings saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading settings…</p>;
  }
  if (!form) {
    return (
      <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
        Could not load settings.
      </p>
    );
  }

  const set = (key: keyof SettingsPayload, value: unknown) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const setSetting = (key: keyof SettingsPayload["settings"], value: unknown) =>
    setForm((f) => (f ? { ...f, settings: { ...f.settings, [key]: value } } : f));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-foreground)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Hospital profile, branding and number prefixes.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          {success}
        </p>
      )}

      <section className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
        <header className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <Building2 size={16} aria-hidden="true" className="text-[var(--color-muted-fg)]" />
          <h2 className="text-sm font-semibold text-[var(--color-foreground)]">Hospital profile</h2>
        </header>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="s-name">Hospital name</label>
            <input id="s-name" className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="s-email">Email</label>
            <input id="s-email" type="email" className={inputCls} value={form.email ?? ""} onChange={(e) => set("email", e.target.value || null)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="s-phone">Phone</label>
            <input id="s-phone" type="tel" className={inputCls} value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value || null)} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="s-address">Address</label>
            <input id="s-address" className={inputCls} value={form.address ?? ""} onChange={(e) => set("address", e.target.value || null)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="s-city">City</label>
            <input id="s-city" className={inputCls} value={form.city ?? ""} onChange={(e) => set("city", e.target.value || null)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="s-state">State</label>
            <input id="s-state" className={inputCls} value={form.state ?? ""} onChange={(e) => set("state", e.target.value || null)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="s-country">Country</label>
            <input id="s-country" className={inputCls} value={form.country} onChange={(e) => set("country", e.target.value)} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
        <header className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <Palette size={16} aria-hidden="true" className="text-[var(--color-muted-fg)]" />
          <h2 className="text-sm font-semibold text-[var(--color-foreground)]">Branding & locale</h2>
        </header>
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor="s-color">Brand color</label>
            <div className="flex items-center gap-2">
              <input
                id="s-color"
                type="color"
                value={form.brand_color}
                onChange={(e) => set("brand_color", e.target.value)}
                className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-[var(--color-border)] bg-white p-1"
              />
              <input className={inputCls} value={form.brand_color} onChange={(e) => set("brand_color", e.target.value)} />
            </div>
            <p className="mt-1 text-xs text-[var(--color-muted-fg)]">Used on your landing page and buttons.</p>
          </div>
          <div>
            <label className={labelCls} htmlFor="s-currency">Currency</label>
            <select id="s-currency" className={inputCls} value={form.currency} onChange={(e) => set("currency", e.target.value)}>
              {["NGN", "USD", "GHS", "KES", "ZAR", "GBP", "EUR"].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="s-tz">Timezone</label>
            <select id="s-tz" className={inputCls} value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {["Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg", "America/New_York", "Europe/London", "UTC"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
        <header className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <Hash size={16} aria-hidden="true" className="text-[var(--color-muted-fg)]" />
          <h2 className="text-sm font-semibold text-[var(--color-foreground)]">Staff & patient numbering</h2>
        </header>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          {(["patientPrefix", "dependantPrefix", "staffPrefix", "invoicePrefix"] as const).map((key) => (
            <div key={key}>
              <label className={labelCls} htmlFor={`s-${key}`}>
                {key.replace(/Prefix$/, "").replace(/^./, (c) => c.toUpperCase())} prefix
              </label>
              <input
                id={`s-${key}`}
                className={inputCls}
                value={form.settings[key] ?? ""}
                onChange={(e) => setSetting(key, e.target.value)}
              />
              <p className="mt-1 text-xs text-[var(--color-muted-fg)]">
                e.g. {form.settings[key] || "PT-"}0001 — the hyphen is added automatically if missing.
              </p>
            </div>
          ))}
          <div>
            <label className={labelCls} htmlFor="s-sms">SMS provider</label>
            <select
              id="s-sms"
              className={inputCls}
              value={form.settings.smsProvider ?? ""}
              onChange={(e) => setSetting("smsProvider", e.target.value || null)}
            >
              <option value="">None</option>
              <option value="twilio">Twilio</option>
              <option value="termii">Termii</option>
              <option value="africastalking">Africa's Talking</option>
            </select>
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] p-3">
            <input
              type="checkbox"
              checked={form.settings.labAutoFill === true}
              onChange={(e) => setSetting("labAutoFill", e.target.checked)}
              className="focus-ring mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
            />
            <span className="text-sm">
              <span className="font-medium text-[var(--color-foreground)]">Auto-fill lab results</span>
              <span className="block text-xs text-[var(--color-muted-fg)]">Pre-fill test result values from the previous result.</span>
            </span>
          </label>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
        >
          <Save size={16} aria-hidden="true" /> {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}