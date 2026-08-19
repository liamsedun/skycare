"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Globe,
  ImagePlus,
  LayoutTemplate,
  Loader2,
  Palette,
  Rocket,
  Stethoscope,
} from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

const DEFAULT_SERVICES = [
  "General Consultation",
  "Cardiology",
  "Laboratory & Diagnostics",
  "Pharmacy",
  "Maternity & Pediatrics",
  "Emergency Care",
  "Surgery",
  "Vaccination",
];

type WebsiteForm = {
  tagline: string;
  about: string;
  hero_image: string;
  emergency_phone: string;
  monFri: string;
  saturday: string;
  sunday: string;
  facebook: string;
  instagram: string;
  x: string;
  whatsapp: string;
  seo_title: string;
  seo_description: string;
  favicon_url: string;
};

type ProfileForm = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
};

type BrandingForm = {
  brand_color: string;
  currency: string;
  timezone: string;
  logo_url: string;
};

const STEPS = [
  { id: 0, label: "Profile", icon: Building2 },
  { id: 1, label: "Branding", icon: Palette },
  { id: 2, label: "Website", icon: Globe },
  { id: 3, label: "Services", icon: Stethoscope },
] as const;

export default function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provisioned, setProvisioned] = useState(false);

  const [profile, setProfile] = useState<ProfileForm>({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    country: "Nigeria",
  });
  const [branding, setBranding] = useState<BrandingForm>({
    brand_color: "#0ea5e9",
    currency: "NGN",
    timezone: "Africa/Lagos",
    logo_url: "",
  });
  const [website, setWebsite] = useState<WebsiteForm>({
    tagline: "",
    about: "",
    hero_image: "",
    emergency_phone: "",
    monFri: "8:00am – 6:00pm",
    saturday: "9:00am – 4:00pm",
    sunday: "Emergency only",
    facebook: "",
    instagram: "",
    x: "",
    whatsapp: "",
    seo_title: "",
    seo_description: "",
    favicon_url: "",
  });
  const [services, setServices] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DEFAULT_SERVICES.map((s) => [s, true]))
  );
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, statusRes] = await Promise.all([
        fetch("/api/tenant-settings", { cache: "no-store" }),
        fetch("/api/website/status", { cache: "no-store" }),
      ]);
      const settingsBody = await settingsRes.json();
      const statusBody = await statusRes.json();
      if (!settingsRes.ok) throw new Error(settingsBody.error ?? "Failed to load settings");
      if (!statusRes.ok) throw new Error(statusBody.error ?? "Failed to load status");

      const d = settingsBody.data;
      const w = (d.website ?? {}) as Record<string, unknown>;
      const opening = (w.opening_hours ?? {}) as Record<string, unknown>;
      const social = (w.social ?? {}) as Record<string, unknown>;

      setProfile({
        name: d.name ?? "",
        email: d.email ?? "",
        phone: d.phone ?? "",
        address: d.address ?? "",
        city: d.city ?? "",
        state: d.state ?? "",
        country: d.country ?? "Nigeria",
      });
      setBranding({
        brand_color: d.brand_color ?? "#0ea5e9",
        currency: d.currency ?? "NGN",
        timezone: d.timezone ?? "Africa/Lagos",
        logo_url: d.logo_url ?? "",
      });
      setWebsite({
        tagline: String(w.tagline ?? ""),
        about: String(w.about ?? ""),
        hero_image: String(w.hero_image ?? ""),
        emergency_phone: String(w.emergency_phone ?? ""),
        monFri: String(opening.mon_fri ?? "8:00am – 6:00pm"),
        saturday: String(opening.saturday ?? "9:00am – 4:00pm"),
        sunday: String(opening.sunday ?? "Emergency only"),
        facebook: String(social.facebook ?? ""),
        instagram: String(social.instagram ?? ""),
        x: String(social.x ?? ""),
        whatsapp: String(social.whatsapp ?? ""),
        seo_title: String(w.seo_title ?? ""),
        seo_description: String(w.seo_description ?? ""),
        favicon_url: String(w.favicon_url ?? ""),
      });

      const status = statusBody.data;
      setProvisioned(!!status?.website_provisioned);
      if (status?.counts?.services > 0 && status?.website_provisioned) {
        // Existing content — reflect actual on/off state.
        const srvRes = await fetch("/api/website/services", { cache: "no-store" });
        const srvBody = await srvRes.json();
        const rows = (srvBody.data ?? []) as { name: string; active: boolean }[];
        setServices((prev) => {
          const next = { ...prev };
          for (const r of rows) next[r.name] = r.active;
          return next;
        });
      } else if (status?.counts?.services > 0) {
        // Already seeded outside the wizard; keep defaults on.
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const serviceNames = useMemo(() => Object.keys(services), [services]);
  const keptServices = useMemo(() => serviceNames.filter((s) => services[s]), [services]);

  async function saveCurrentStep(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      let res: Response;
      if (step === 0) {
        res = await fetch("/api/tenant-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile: { ...profile, email: profile.email || null, phone: profile.phone || null },
          }),
        });
      } else if (step === 1) {
        res = await fetch("/api/tenant-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile: {
              brand_color: branding.brand_color,
              currency: branding.currency,
              timezone: branding.timezone,
              logo_url: branding.logo_url || null,
            },
          }),
        });
      } else {
        // Step 2 — website content (schema-editable, not clobbered by seed).
        res = await fetch("/api/tenant-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            website: {
              tagline: website.tagline || null,
              about: website.about || null,
              hero_image: website.hero_image || null,
              emergency_phone: website.emergency_phone || null,
              opening_hours: {
                mon_fri: website.monFri || null,
                saturday: website.saturday || null,
                sunday: website.sunday || null,
              },
              social: {
                facebook: website.facebook || null,
                instagram: website.instagram || null,
                x: website.x || null,
                whatsapp: website.whatsapp || null,
              },
              seo_title: website.seo_title || null,
              seo_description: website.seo_description || null,
              favicon_url: website.favicon_url || null,
            },
          }),
        });
      }
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save");
    } catch (e) {
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function goNext() {
    try {
      if (step < 2) await saveCurrentStep();
      setStep((s) => s + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      // Save the last editable step (website content), then provision defaults.
      await saveCurrentStep();

      // Phase 4: seed the default website content (name-derived defaults filled
      // by the RPC only where unset — the values just saved are preserved).
      const prov = await fetch("/api/website/provision", { method: "POST" });
      const provBody = await prov.json();
      if (!prov.ok) throw new Error(provBody.error ?? "Failed to provision website");

      // Remove any default services the user switched off (by name).
      const keep = new Set(keptServices);
      const srvRes = await fetch("/api/website/services", { cache: "no-store" });
      const srvBody = await srvRes.json();
      const rows = (srvBody.data ?? []) as { id: string; name: string }[];
      for (const r of rows) {
        if (!keep.has(r.name)) {
          await fetch(`/api/website/services/${r.id}`, { method: "DELETE" });
        }
      }

      router.replace("/app");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to finish setup");
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch("/api/uploads/tenant-logo", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      setBranding((b) => ({ ...b, logo_url: body.data.logo_url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logo upload failed");
    } finally {
      setUploadingLogo(false);
      if (logoRef.current) logoRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center text-sm text-[var(--color-muted-fg)]">
        Loading website setup…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <div className="rounded-2xl bg-gradient-to-br from-sky-600 to-blue-700 px-6 py-6 text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
            <Rocket size={22} />
          </span>
          <div>
            <h1 className="text-xl font-bold">Set up your hospital website</h1>
            <p className="mt-0.5 text-sm text-sky-100">
              We&apos;ll build your free, branded site on {profile.name || "your"} own subdomain. Take it step by step.
            </p>
          </div>
        </div>
      </div>

      {provisioned && (
        <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          <Check size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          Your default website content is already in place — edit anything below and save.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                i === step
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary-dark)]"
                  : i < step
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-[var(--color-border)] bg-white text-[var(--color-muted-fg)]"
              }`}
              aria-current={i === step ? "step" : undefined}
            >
              <s.icon size={13} aria-hidden="true" />
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && <div className="h-px flex-1 bg-[var(--color-border)]" />}
          </div>
        ))}
      </div>

      {/* STEP 0 — PROFILE */}
      {step === 0 && (
        <section className="rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]">
          <h2 className="text-sm font-semibold text-[var(--color-foreground)]">Hospital profile</h2>
          <p className="mt-1 text-xs text-[var(--color-muted-fg)]">
            Shown across your website footer, receipts and the portals.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="w-name">Hospital name</label>
              <input id="w-name" className={inputCls} value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls} htmlFor="w-email">Email</label>
              <input id="w-email" type="email" className={inputCls} value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls} htmlFor="w-phone">Phone</label>
              <input id="w-phone" type="tel" className={inputCls} value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="w-address">Address</label>
              <input id="w-address" className={inputCls} value={profile.address} onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls} htmlFor="w-city">City</label>
              <input id="w-city" className={inputCls} value={profile.city} onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls} htmlFor="w-state">State</label>
              <input id="w-state" className={inputCls} value={profile.state} onChange={(e) => setProfile((p) => ({ ...p, state: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="w-country">Country</label>
              <select id="w-country" className={inputCls} value={profile.country} onChange={(e) => setProfile((p) => ({ ...p, country: e.target.value }))}>
                {["Nigeria", "Ghana", "Kenya", "South Africa", "United Kingdom", "United States"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </section>
      )}

      {/* STEP 1 — BRANDING */}
      {step === 1 && (
        <section className="rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]">
          <h2 className="text-sm font-semibold text-[var(--color-foreground)]">Branding & locale</h2>
          <p className="mt-1 text-xs text-[var(--color-muted-fg)]">Your logo and colours show on the website and patient dashboards.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className={labelCls}>Hospital logo</label>
              <div className="flex items-center gap-3">
                {branding.logo_url ? (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={branding.logo_url} alt="Logo preview" className="h-full w-full object-contain" />
                  </span>
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[var(--color-muted-fg)]">
                    <ImagePlus size={20} aria-hidden="true" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => logoRef.current?.click()}
                  disabled={uploadingLogo}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-foreground)] transition-colors hover:bg-slate-50 disabled:opacity-60"
                >
                  {uploadingLogo ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <ImagePlus size={14} aria-hidden="true" />}
                  {uploadingLogo ? "Uploading…" : branding.logo_url ? "Replace" : "Upload logo"}
                </button>
                <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={uploadLogo} />
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="w-color">Brand colour</label>
              <div className="flex items-center gap-2">
                <input id="w-color" type="color" value={branding.brand_color} onChange={(e) => setBranding((b) => ({ ...b, brand_color: e.target.value }))} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-[var(--color-border)] bg-white p-1" />
                <input className={inputCls} value={branding.brand_color} onChange={(e) => setBranding((b) => ({ ...b, brand_color: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="w-currency">Currency</label>
              <select id="w-currency" className={inputCls} value={branding.currency} onChange={(e) => setBranding((b) => ({ ...b, currency: e.target.value }))}>
                {["NGN", "USD", "GHS", "KES", "ZAR", "GBP", "EUR"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="w-tz">Timezone</label>
              <select id="w-tz" className={inputCls} value={branding.timezone} onChange={(e) => setBranding((b) => ({ ...b, timezone: e.target.value }))}>
                {["Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg", "America/New_York", "Europe/London", "UTC"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </section>
      )}

      {/* STEP 2 — WEBSITE CONTENT */}
      {step === 2 && (
        <section className="rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]">
          <h2 className="text-sm font-semibold text-[var(--color-foreground)]">Website content</h2>
          <p className="mt-1 text-xs text-[var(--color-muted-fg)]">The tagline and about text power your homepage hero and every page&apos;s SEO.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="w-tagline">Tagline</label>
              <input id="w-tagline" className={inputCls} value={website.tagline} onChange={(e) => setWebsite((w) => ({ ...w, tagline: e.target.value }))} />
              <p className="mt-1 text-xs text-[var(--color-muted-fg)]">e.g. “Quality care, close to home.”</p>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="w-about">About your hospital</label>
              <textarea id="w-about" rows={4} className={inputCls} value={website.about} onChange={(e) => setWebsite((w) => ({ ...w, about: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls} htmlFor="w-emergency">Emergency phone</label>
              <input id="w-emergency" type="tel" className={inputCls} value={website.emergency_phone} onChange={(e) => setWebsite((w) => ({ ...w, emergency_phone: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls} htmlFor="w-hero">Hero image URL</label>
              <input id="w-hero" type="url" className={inputCls} value={website.hero_image} onChange={(e) => setWebsite((w) => ({ ...w, hero_image: e.target.value }))} placeholder="https://…" />
            </div>
            <div className="sm:col-span-2">
              <p className="text-sm font-medium text-[var(--color-foreground)]">Opening hours</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls} htmlFor="w-monfri">Mon – Fri</label>
                  <input id="w-monfri" className={inputCls} value={website.monFri} onChange={(e) => setWebsite((w) => ({ ...w, monFri: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="w-sat">Saturday</label>
                  <input id="w-sat" className={inputCls} value={website.saturday} onChange={(e) => setWebsite((w) => ({ ...w, saturday: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="w-sun">Sunday</label>
                  <input id="w-sun" className={inputCls} value={website.sunday} onChange={(e) => setWebsite((w) => ({ ...w, sunday: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="sm:col-span-2">
              <p className="text-sm font-medium text-[var(--color-foreground)]">Social links</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="w-fb">Facebook</label>
                  <input id="w-fb" type="url" className={inputCls} value={website.facebook} onChange={(e) => setWebsite((w) => ({ ...w, facebook: e.target.value }))} placeholder="https://facebook.com/…" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="w-ig">Instagram</label>
                  <input id="w-ig" type="url" className={inputCls} value={website.instagram} onChange={(e) => setWebsite((w) => ({ ...w, instagram: e.target.value }))} placeholder="https://instagram.com/…" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="w-x">X / Twitter</label>
                  <input id="w-x" type="url" className={inputCls} value={website.x} onChange={(e) => setWebsite((w) => ({ ...w, x: e.target.value }))} placeholder="https://x.com/…" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="w-wa">WhatsApp</label>
                  <input id="w-wa" type="url" className={inputCls} value={website.whatsapp} onChange={(e) => setWebsite((w) => ({ ...w, whatsapp: e.target.value }))} placeholder="https://wa.me/…" />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* STEP 3 — SERVICES */}
      {step === 3 && (
        <section className="rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-2">
            <LayoutTemplate size={16} className="text-[var(--color-primary)]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-[var(--color-foreground)]">Services on your website</h2>
          </div>
          <p className="mt-1 text-xs text-[var(--color-muted-fg)]">
            These eight services are published on your site. Toggle off any you don&apos;t offer yet — you can change this
            anytime in Settings → Website Content.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {serviceNames.map((name) => (
              <label key={name} className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${services[name] ? "border-emerald-200 bg-emerald-50/50" : "border-[var(--color-border)] bg-white"}`}>
                <input
                  type="checkbox"
                  checked={!!services[name]}
                  onChange={(e) => setServices((s) => ({ ...s, [name]: e.target.checked }))}
                  className="focus-ring mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
                />
                <span className="text-sm">
                  <span className="font-medium text-[var(--color-foreground)]">{name}</span>
                  <span className="block text-xs text-[var(--color-muted-fg)]">{services[name] ? "Published on your site" : "Hidden from your site"}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => step > 0 && setStep((s) => s - 1)}
          disabled={step === 0}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--color-foreground)] transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft size={16} aria-hidden="true" /> Back
        </button>

        {step < 3 ? (
          <button
            type="button"
            onClick={goNext}
            disabled={saving || profile.name.trim().length < 2}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
            Continue <ChevronRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            disabled={saving}
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
            {saving ? "Setting up…" : "Finish & go to dashboard"}
          </button>
        )}
      </div>

      <p className="flex items-start gap-2 text-xs text-[var(--color-muted-fg)]">
        <CircleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
        After finishing, your site is live at{" "}
        <span className="font-medium">
          https://<span className="lowercase">{profile.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "hospital"}</span>.skycare.app
        </span>
        . Preview it anytime from Settings → Custom Domains.
        <ExternalLink size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
      </p>
    </div>
  );
}