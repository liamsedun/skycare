"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Check, Loader2, Moon, Save, Sun, UserRound } from "lucide-react";
import { ROLE_LABELS, initials } from "@/lib/auth";
import type { AppRole } from "@/lib/auth";
import { applyTheme } from "@/lib/theme";
import type { ThemeMode } from "@/lib/theme";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)] disabled:bg-slate-50 disabled:text-[var(--color-muted-fg)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";
const cardCls = "rounded-xl border border-[var(--color-border)] bg-white p-6 shadow-sm";

interface MeData {
  user: {
    id: string;
    email: string;
    full_name: string;
    role: AppRole;
  } | null;
  tenant: { name: string } | null;
}

interface Preferences {
  theme: "light" | "dark";
  language: string;
  timezone: string;
  dateFormat: string;
  notifyAppointment: boolean;
  notifyPayment: boolean;
  notifyLab: boolean;
  notifyPharmacy: boolean;
  pushEnabled: boolean;
}

const DEFAULT_PREFS: Preferences = {
  theme: "light",
  language: "en",
  timezone: "Africa/Lagos",
  dateFormat: "dd/mm/yyyy",
  notifyAppointment: true,
  notifyPayment: true,
  notifyLab: true,
  notifyPharmacy: true,
  pushEnabled: false,
};

function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--color-foreground)]">{label}</p>
        <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-50 bg-slate-200 data-[on=true]:bg-[var(--color-primary)]"
        data-on={checked}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

export default function AccountView() {
  const [me, setMe] = useState<MeData | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, prefsRes] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch("/api/account/preferences", { cache: "no-store" }),
      ]);
      const meBody = await meRes.json();
      if (meRes.ok) setMe(meBody.data);
      const prefsBody = await prefsRes.json();
      if (prefsRes.ok) {
        const loaded = { ...DEFAULT_PREFS, ...(prefsBody.data ?? {}) };
        setPrefs(loaded);
        if (loaded.theme === "dark" || loaded.theme === "light") {
          document.documentElement.dataset.theme = loaded.theme;
          applyTheme(loaded.theme);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/account/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save preferences");
      setMsg({ ok: true, text: "Preferences saved." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--color-muted-fg)]">
        Loading…
      </div>
    );
  }

  const user = me?.user ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Account</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
          Manage your personal preferences and notification settings.
        </p>
      </div>

      <div className={`grid grid-cols-1 gap-6 lg:grid-cols-3`}>
        <div className={`${cardCls} lg:col-span-1`}>
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-foreground)]">
            <UserRound size={18} className="text-[var(--color-primary)]" aria-hidden="true" />
            Your account
          </h2>
          <div className="mt-5 flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-primary)] text-xl font-semibold text-white">
              {initials(user?.full_name ?? "Staff")}
            </div>
            <p className="mt-3 text-base font-semibold text-[var(--color-foreground)]">
              {user?.full_name ?? "Staff"}
            </p>
            <p className="text-sm text-[var(--color-muted-fg)]">{user?.email}</p>
            {user && (
              <span className="mt-2 rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-primary-dark)]">
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
            )}
            <p className="mt-3 text-xs text-[var(--color-muted-fg)]">
              {me?.tenant?.name ? `Hospital: ${me.tenant.name}` : "SkyCare platform"}
            </p>
          </div>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <div className={`${cardCls}`}>
            <h2 className="text-base font-semibold text-[var(--color-foreground)]">Display preferences</h2>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--color-border)] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[var(--color-foreground)]">Theme</p>
                  <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
                    Light mode uses the SkyCare sky palette; Dark mode uses the Dusk &amp; Gold scheme.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      update("theme", "light");
                      document.documentElement.dataset.theme = "light";
                      applyTheme("light");
                    }}
                    aria-pressed={prefs.theme === "light"}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                      prefs.theme === "light"
                        ? "bg-white text-[var(--color-primary-dark)] shadow-sm"
                        : "text-[var(--color-muted-fg)] hover:text-[var(--color-foreground)]"
                    }`}
                  >
                    <Sun size={15} aria-hidden="true" /> Light
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      update("theme", "dark");
                      document.documentElement.dataset.theme = "dark";
                      applyTheme("dark");
                    }}
                    aria-pressed={prefs.theme === "dark"}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                      prefs.theme === "dark"
                        ? "bg-[var(--color-primary)] text-[#0a0f1a] shadow-sm"
                        : "text-[var(--color-muted-fg)] hover:text-[var(--color-foreground)]"
                    }`}
                  >
                    <Moon size={15} aria-hidden="true" /> Dark
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="pref-language" className={labelCls}>
                    Language
                  </label>
                <select
                  id="pref-language"
                  value={prefs.language}
                  onChange={(e) => update("language", e.target.value)}
                  className={inputCls}
                >
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                  <option value="sw">Kiswahili</option>
                  <option value="ha">Hausa</option>
                  <option value="yo">Yoruba</option>
                  <option value="ig">Igbo</option>
                </select>
              </div>
              <div>
                <label htmlFor="pref-timezone" className={labelCls}>
                  Timezone
                </label>
                <select
                  id="pref-timezone"
                  value={prefs.timezone}
                  onChange={(e) => update("timezone", e.target.value)}
                  className={inputCls}
                >
                  <option value="Africa/Lagos">Africa/Lagos (WAT)</option>
                  <option value="Africa/Accra">Africa/Accra (GMT)</option>
                  <option value="Africa/Nairobi">Africa/Nairobi (EAT)</option>
                  <option value="Africa/Johannesburg">Africa/Johannesburg (SAST)</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              <div>
                <label htmlFor="pref-date-format" className={labelCls}>
                  Date format
                </label>
                <select
                  id="pref-date-format"
                  value={prefs.dateFormat}
                  onChange={(e) => update("dateFormat", e.target.value)}
                  className={inputCls}
                >
                  <option value="dd/mm/yyyy">DD/MM/YYYY</option>
                  <option value="mm/dd/yyyy">MM/DD/YYYY</option>
                  <option value="yyyy-mm-dd">YYYY-MM-DD</option>
                </select>
              </div>
            </div>
            </div>
          </div>

          <div className={`${cardCls}`}>
            <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-foreground)]">
              <Bell className="text-[var(--color-primary)]" size={18} aria-hidden="true" />
              Notification preferences
            </h2>
            <div className="mt-2 divide-y divide-[var(--color-border)]">
              <SwitchRow
                label="Push notifications"
                description="Receive notifications on this device when SkyCare is installed."
                checked={prefs.pushEnabled}
                onChange={(v) => update("pushEnabled", v)}
              />
              <SwitchRow
                label="Appointments"
                description="New bookings, reschedules and reminders."
                checked={prefs.notifyAppointment}
                onChange={(v) => update("notifyAppointment", v)}
              />
              <SwitchRow
                label="Payments & billing"
                description="Payment confirmations, invoices and receipts."
                checked={prefs.notifyPayment}
                onChange={(v) => update("notifyPayment", v)}
              />
              <SwitchRow
                label="Lab results"
                description="Ready result and sample updates."
                checked={prefs.notifyLab}
                onChange={(v) => update("notifyLab", v)}
              />
              <SwitchRow
                label="Pharmacy"
                description="Prescriptions and refill reminders."
                checked={prefs.notifyPharmacy}
                onChange={(v) => update("notifyPharmacy", v)}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            {msg && (
              <span className={`text-sm ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>
                {msg.ok ? <Check size={14} className="mr-1 inline" /> : null}
                {msg.text}
              </span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-opacity duration-200 hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? "Saving…" : "Save preferences"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}