"use client";

import { cardTitle, fgMedium, mutedXsMt1 } from "@/lib/ui-constants";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CircleAlert, Loader2, Rocket } from "lucide-react";

type Status = {
  slug: string | null;
  website_enabled: boolean;
  website_provisioned: boolean;
  website: Record<string, unknown>;
  counts: { services: number; departments: number; pages: number };
};

export default function WebsiteOnboardingSection() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [togglingSite, setTogglingSite] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/website/status", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load website status");
      setStatus(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load website status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function provision() {
    setProvisioning(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/website/provision", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to provision website content");
      setSuccess("Default website content created — review it in Settings → Website Content.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to provision website content");
    } finally {
      setProvisioning(false);
    }
  }

  async function toggleSite() {
    if (!status) return;
    setTogglingSite(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/tenant-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website_enabled: !status.website_enabled }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update");
      setSuccess(status.website_enabled ? "Your website is now hidden. Visitors will see a short notice." : "Your website is live.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setTogglingSite(false);
    }
  }

  if (loading) {
    return <p className="py-8 text-center text-sm text-[var(--color-muted-fg)]">Loading website status…</p>;
  }

  const siteUrl = status?.slug ? `https://${status.slug}.skycare.app` : null;

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-5 py-3">
        <Rocket size={16} aria-hidden="true" className="text-[var(--color-primary)]" />
        <h2 className={cardTitle}>Website setup</h2>
        {status?.website_provisioned ? (
          <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            Provisioned
          </span>
        ) : (
          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
            Not started
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="mx-5 mt-4 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="mx-5 mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          {success}
        </p>
      )}

      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] p-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
            <Rocket size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className={cardTitle}>
              {status?.website_provisioned ? "Your website content is ready" : "Set up your hospital website"}
            </p>
            <p className={mutedXsMt1}>
              {status?.website_provisioned
                ? `${status.counts.services} service(s), ${status.counts.departments} department(s) and ${status.counts.pages} page(s) are live on your public site.`
                : "Guided step-by-step setup: profile, branding, website content and services — the default content is created for you."}
            </p>
            <Link
              href="/app/onboarding"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)]"
            >
              {status?.website_provisioned ? "Review website setup" : "Start website setup"}
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
        </div>

        {status?.website_provisioned && (
          <button
            type="button"
            onClick={provision}
            disabled={provisioning}
            className="focus-ring inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-foreground)] transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            {provisioning ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
            {provisioning ? "Provisioning…" : "Provision default website"}
          </button>
        )}

        <label className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] p-3">
          <input
            type="checkbox"
            checked={status?.website_enabled !== false}
            onChange={toggleSite}
            disabled={togglingSite}
            className="focus-ring mt-0.5 h-4 w-4 accent-[var(--color-primary)] disabled:opacity-60"
          />
          <span className="text-sm">
            <span className={fgMedium}>Public website visible</span>
            <span className="block text-xs text-[var(--color-muted-fg)]">
              When off, visitors see a short notice with your contact details instead of the full site.
            </span>
          </span>
        </label>

        <div className="flex items-center gap-2 text-xs text-[var(--color-muted-fg)]">
          <CircleAlert size={13} aria-hidden="true" className="shrink-0" />
          <span>
            Your public site lives at{" "}
            {siteUrl ? (
              <a href={siteUrl} target="_blank" rel="noreferrer" className="font-medium text-[var(--color-primary-dark)] hover:underline">
                {siteUrl}
              </a>
            ) : (
              "your own subdomain"
            )}{" "}
            — manage custom domains in Settings → Custom Domains.
          </span>
        </div>
      </div>
    </section>
  );
}