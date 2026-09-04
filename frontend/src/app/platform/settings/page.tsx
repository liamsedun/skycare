"use client";

import { useEffect, useState } from "react";
import {
  Globe, Mail, Cloud, Shield, Bell, Zap,
  Save, RefreshCw, Loader2,
} from "lucide-react";
import { PlatformGlassCard, PlatformPageHeader } from "@/components/platform/platform-mobile-ui";

interface ConfigValue { key: string; value: unknown; description: string; category: string; }

const CATEGORIES = [
  { name: "Branding", icon: Globe, keys: ["platform_name", "support_email"] },
  { name: "Subscriptions", icon: Mail, keys: ["trial_duration_days", "default_plan"] },
  { name: "System", icon: Cloud, keys: ["backup_enabled", "backup_retention_days", "max_tenants"] },
  { name: "Data & Security", icon: Shield, keys: ["data_retention_days", "maintenance_mode"] },
  { name: "Notifications", icon: Bell, keys: ["email_notifications"] },
];

const DESCRIPTIONS: Record<string, string> = {
  platform_name: "Platform display name shown everywhere",
  support_email: "Support contact email for tenants",
  trial_duration_days: "Default trial period for new tenants (days)",
  default_plan: "Default subscription plan for new signups",
  backup_enabled: "Enable automated database backups",
  backup_retention_days: "Number of days to retain backup files",
  data_retention_days: "Days to keep audit log data before cleanup",
  maintenance_mode: "Put the platform in maintenance mode",
  max_tenants: "Maximum number of hospital tenants allowed",
  email_notifications: "Send email notifications for platform events",
};

export default function SettingsPage() {
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/config", { credentials: "include" });
      const d = await res.json();
      setConfig(d.data?.values || {});
      setEdits({});
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function hasEdit(key: string) {
    return JSON.stringify(edits[key]) !== JSON.stringify(config[key]) && edits[key] !== undefined;
  }

  function getVal(key: string) {
    return edits[key] !== undefined ? edits[key] : config[key];
  }

  async function saveKey(key: string) {
    setSaving(key);
    try {
      const val = edits[key] !== undefined ? edits[key] : config[key];
      await fetch("/api/platform/config", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: val }),
      });
      setConfig((prev) => ({ ...prev, [key]: val }));
      setEdits((prev) => { const n = { ...prev }; delete n[key]; return n; });
    } catch (e) { console.error(e); }
    setSaving(null);
  }

  function renderInput(key: string, val: unknown) {
    if (typeof val === "boolean" || (edits[key] !== undefined && typeof edits[key] === "boolean")) {
      const v = edits[key] !== undefined ? edits[key] : val;
      return (
        <button type="button"
          onClick={() => setEdits({ ...edits, [key]: !v })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${v ? "bg-blue-600" : "bg-gray-300"}`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${v ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      );
    }
    if (typeof val === "number") {
      return <input type="number" value={Number(getVal(key))} onChange={(e) => setEdits({ ...edits, [key]: Number(e.target.value) })}
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm" />;
    }
    return <input type="text" value={String(getVal(key) ?? "")} onChange={(e) => setEdits({ ...edits, [key]: e.target.value })}
      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm" />;
  }

  return (
    <div className="space-y-6 platform-stagger">
      <PlatformPageHeader title="System Settings" subtitle="Configure platform-wide settings">
        <button onClick={load} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-muted)]">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </PlatformPageHeader>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
      ) : (
        <div className="space-y-4">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <PlatformGlassCard key={cat.name}>
                <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-6 py-4">
                  <Icon className="h-5 w-5 text-blue-600" />
                  <h2 className="font-semibold text-[var(--color-foreground)]">{cat.name}</h2>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {cat.keys.map((key) => {
                    const val = config[key];
                    if (val === undefined) return null;
                    const dirty = hasEdit(key);
                    return (
                      <div key={key} className="flex items-center justify-between gap-4 px-6 py-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[var(--color-foreground)]">{key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</p>
                          <p className="text-xs text-[var(--color-muted-fg)]">{DESCRIPTIONS[key] || ""}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-64">{renderInput(key, val)}</div>
                          {dirty && (
                            <button onClick={() => saveKey(key)} disabled={saving === key}
                              className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 platform-btn-gradient">
                              {saving === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                              Save
                            </button>
                          )}
                          {dirty && (
                            <button onClick={() => setEdits((prev) => { const n = { ...prev }; delete n[key]; return n; })}
                              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs hover:bg-[var(--color-muted)]">
                              Discard
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </PlatformGlassCard>
            );
          })}

          <PlatformGlassCard className="px-6 py-4">
            <div className="flex items-center gap-3 mb-3">
              <Zap className="h-5 w-5 text-amber-500" />
              <h2 className="font-semibold text-[var(--color-foreground)]">System Status</h2>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="rounded-lg bg-[var(--color-muted)] p-3 text-center">
                <p className="text-xs text-[var(--color-muted-fg)]">Config Keys</p>
                <p className="text-lg font-bold text-[var(--color-foreground)]">{Object.keys(config).length}</p>
              </div>
              <div className="rounded-lg bg-[var(--color-muted)] p-3 text-center">
                <p className="text-xs text-[var(--color-muted-fg)]">Unsaved Changes</p>
                <p className="text-lg font-bold text-[var(--color-foreground)]">{Object.keys(edits).filter((k) => hasEdit(k)).length}</p>
              </div>
              <div className="rounded-lg bg-[var(--color-muted)] p-3 text-center">
                <p className="text-xs text-[var(--color-muted-fg)]">Categories</p>
                <p className="text-lg font-bold text-[var(--color-foreground)]">{CATEGORIES.length}</p>
              </div>
            </div>
          </PlatformGlassCard>
        </div>
      )}
    </div>
  );
}
