"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  ChevronDown,
  CreditCard,
  Database,
  Hash,
  ImagePlus,
  Landmark,
  Loader2,
  Palette,
  Save,
  Stethoscope,
  Trash2,
} from "lucide-react";
import { DEFAULT_TENANT_SETTINGS, PREFIX_PATTERN } from "@/lib/tenant-settings";
import BankAccountsSection from "@/components/dashboard/bank-accounts-section";
import WebsiteDoctorsSection from "@/components/dashboard/website-doctors-section";
import SystemBackupSection from "@/components/dashboard/system-backup-section";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

interface PaystackSettings {
  publicKey?: string | null;
  secretKeyConfigured?: boolean;
  webhookSecretConfigured?: boolean;
  configured?: boolean;
}

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
  logo_url: string | null;
  settings: {
    patientPrefix?: string;
    dependantPrefix?: string;
    staffPrefix?: string;
    invoicePrefix?: string;
    smsProvider?: string | null;
    labAutoFill?: boolean;
    paystack?: PaystackSettings;
  };
}

const SECTIONS = [
  { id: "profile", label: "Hospital Profile", icon: Building2 },
  { id: "branding", label: "Branding & Locale", icon: Palette },
  { id: "numbering", label: "Staff & Patient Numbering", icon: Hash },
  { id: "payments", label: "Online Payments (Paystack)", icon: CreditCard },
  { id: "bank-accounts", label: "Bank Accounts", icon: Landmark },
  { id: "doctors", label: "Website Doctors", icon: Stethoscope },
  { id: "backup", label: "System Backup", icon: Database },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export default function TenantSettingsView() {
  const [form, setForm] = useState<SettingsPayload | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("profile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Paystack key inputs — held separately so untouched fields are NOT sent
  // back (only edited keys are patched; empty edited field = clear the key).
  const [psKeys, setPsKeys] = useState<{ publicKey: string; secretKey: string; webhookSecret: string }>({
    publicKey: "",
    secretKey: "",
    webhookSecret: "",
  });
  const [psEdited, setPsEdited] = useState<{ publicKey: boolean; secretKey: boolean; webhookSecret: boolean }>({
    publicKey: false,
    secretKey: false,
    webhookSecret: false,
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setError(null);
    setSuccess(null);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch("/api/uploads/tenant-logo", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      set("logo_url", body.data.logo_url);
      setSuccess("Logo uploaded — save changes to keep it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logo upload failed");
    } finally {
      setUploadingLogo(false);
      if (logoRef.current) logoRef.current.value = "";
    }
  }

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
        logo_url: d.logo_url ?? null,
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
      const settings: Record<string, unknown> = { ...form.settings };
      // Only include paystack keys that were edited — "" (blank) clears, non-blank sets.
      const paystackPatch: Record<string, string> = {};
      (["publicKey", "secretKey", "webhookSecret"] as const).forEach((k) => {
        if (psEdited[k]) paystackPatch[k] = psKeys[k].trim();
      });
      if (Object.keys(paystackPatch).length > 0) settings.paystack = paystackPatch;

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
            logo_url: form.logo_url,
          },
          settings,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save settings");
      setSuccess("Settings saved.");
      setPsEdited({ publicKey: false, secretKey: false, webhookSecret: false });
      setPsKeys({ publicKey: "", secretKey: "", webhookSecret: "" });
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

  const activeSectionDef = SECTIONS.find((s) => s.id === activeSection)!;
  const ActiveIcon = activeSectionDef.icon;

  // Sections that share the unified save flow (profile/branding/numbering/payments).
  const isSaveableSection = activeSection === "profile" || activeSection === "branding" ||
    activeSection === "numbering" || activeSection === "payments";

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

      {/* Section picker */}
      <div className="relative w-full sm:max-w-sm">
        <select
          value={activeSection}
          onChange={(e) => setActiveSection(e.target.value as SectionId)}
          className="h-11 w-full appearance-none rounded-lg border border-[var(--color-border)] bg-white px-3 pr-10 text-sm font-medium text-[var(--color-foreground)] outline-none transition-colors duration-200 focus:border-[var(--color-primary)]"
          aria-label="Settings section"
        >
          {SECTIONS.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]"
        />
      </div>

      <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2">
        <ActiveIcon size={16} aria-hidden="true" className="text-[var(--color-primary)]" />
        <span className="text-sm font-semibold text-[var(--color-foreground)]">{activeSectionDef.label}</span>
      </div>

      {activeSection === "profile" && (
        <section className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
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
      )}

      {activeSection === "branding" && (
        <section className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className={labelCls} htmlFor="s-logo">Hospital logo</label>
              <div className="flex items-center gap-3">
                {form.logo_url ? (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
                    <img src={form.logo_url} alt="Hospital logo preview" className="h-full w-full object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  </span>
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[var(--color-muted-fg)]">
                    <ImagePlus size={20} aria-hidden="true" />
                  </span>
                )}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => logoRef.current?.click()}
                      disabled={uploadingLogo}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-foreground)] transition-colors duration-200 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {uploadingLogo ? <Loader2 size={14} aria-hidden="true" className="animate-spin" /> : <ImagePlus size={14} aria-hidden="true" />}
                      {uploadingLogo ? "Uploading…" : form.logo_url ? "Replace" : "Upload"}
                    </button>
                    {form.logo_url && (
                      <button
                        type="button"
                        onClick={() => set("logo_url", null)}
                        className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-destructive)] transition-colors duration-200 hover:bg-red-50"
                      >
                        <Trash2 size={14} aria-hidden="true" /> Remove
                      </button>
                    )}
                  </div>
                  <input
                    ref={logoRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={uploadLogo}
                  />
                </div>
              </div>
              <p className="mt-1 text-xs text-[var(--color-muted-fg)]">Shown next to your hospital name in the portals. Max 2 MB.</p>
            </div>
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
      )}

      {activeSection === "numbering" && (
        <section className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
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
      )}

      {activeSection === "payments" && (
        <section className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-5 py-3">
            <CreditCard size={16} aria-hidden="true" className="text-[var(--color-muted-fg)]" />
            <h2 className="text-sm font-semibold text-[var(--color-foreground)]">Online payments (Paystack)</h2>
            {form.settings.paystack?.configured ? (
              <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                Active
              </span>
            ) : (
              <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                Not configured
              </span>
            )}
          </div>
          <div className="space-y-4 p-5">
            <p className="text-xs text-[var(--color-muted-fg)]">
              Enter your Paystack API keys so patients can pay invoices online with a card. When keys are active, patients
              see a <strong>Pay online</strong> option on their billing page. Leave a field blank to keep the current
              value; save a blank field to remove that key. Keys are stored per hospital and never shown again after
              saving.
            </p>
            <div>
              <label className={labelCls} htmlFor="s-ps-public">Public key</label>
              <input
                id="s-ps-public"
                type="text"
                placeholder={
                  form.settings.paystack?.publicKey
                    ? `Current: ${form.settings.paystack.publicKey} (leave blank to keep)`
                    : "pk_live_… or pk_test_…"
                }
                value={psKeys.publicKey}
                onChange={(e) => {
                  setPsKeys((k) => ({ ...k, publicKey: e.target.value }));
                  setPsEdited((k) => ({ ...k, publicKey: true }));
                }}
                className={inputCls}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="s-ps-secret">Secret key</label>
              <input
                id="s-ps-secret"
                type="password"
                placeholder={form.settings.paystack?.secretKeyConfigured ? "Current key is set — leave blank to keep" : "sk_live_… or sk_test_…"}
                value={psKeys.secretKey}
                onChange={(e) => {
                  setPsKeys((k) => ({ ...k, secretKey: e.target.value }));
                  setPsEdited((k) => ({ ...k, secretKey: true }));
                }}
                className={inputCls}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="s-ps-webhook">Webhook secret</label>
              <input
                id="s-ps-webhook"
                type="password"
                placeholder={form.settings.paystack?.webhookSecretConfigured ? "Current secret is set — leave blank to keep" : "SHA-512 secret from your Paystack dashboard"}
                value={psKeys.webhookSecret}
                onChange={(e) => {
                  setPsKeys((k) => ({ ...k, webhookSecret: e.target.value }));
                  setPsEdited((k) => ({ ...k, webhookSecret: true }));
                }}
                className={inputCls}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <p className="text-xs text-[var(--color-muted-fg)]">
              In Paystack, set the webhook URL to <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">https://your-hospital-domain/api/payments/webhook</code>{" "}
              and paste the webhook signature secret above so payments are confirmed automatically.
            </p>
          </div>
        </section>
      )}

      {activeSection === "bank-accounts" && <BankAccountsSection />}
      {activeSection === "doctors" && <WebsiteDoctorsSection />}
      {activeSection === "backup" && <SystemBackupSection />}

      {isSaveableSection && (
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
      )}
    </div>
  );
}