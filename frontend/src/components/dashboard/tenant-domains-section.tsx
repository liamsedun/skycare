"use client";

import { mutedXs, flexGap2, spinner } from "@/lib/ui-constants";
import { useCallback, useEffect, useState } from "react";
import { Globe, Loader2, Plus, Star, Trash2 } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const chipCls =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";

interface TenantDomain {
  id: string;
  domain: string;
  is_primary: boolean;
  verification_status: string;
  ssl_status: string | null;
  created_at: string;
}

export default function TenantDomainsSection() {
  const [domains, setDomains] = useState<TenantDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tenant-domains", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load domains");
      setDomains(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load domains");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tenant-domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: value }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to add domain");
      setValue("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add domain");
    } finally {
      setBusy(false);
    }
  }

  async function setPrimary(d: TenantDomain) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenant-domains/${d.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update domain");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update domain");
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: TenantDomain) {
    if (
      !confirm(
        d.is_primary
          ? `Remove primary domain ${d.domain}? Visitors on this domain will stop seeing your site.`
          : `Remove ${d.domain} from your account?`
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenant-domains/${d.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to remove domain");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove domain");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
        <p className="font-medium">Connect your own domain</p>
        <p className="mt-1">
          Add a domain like <span className="font-mono">www.yourhospital.com</span> and set
          your DNS{" "}
          <span className="font-mono">CNAME</span> record to{" "}
          <span className="font-mono">cname.skycare.app</span>. The primary domain is what
          visitors see in the address bar.
        </p>
      </div>

      <form onSubmit={add} className="flex gap-2">
        <input
          className={inputCls}
          placeholder="www.yourhospital.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50"
        >
          {busy ? <Loader2 className={spinner} /> : <Plus className="h-4 w-4" />}
          Add
        </button>
      </form>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--color-muted-fg)]">
          <Loader2 className={spinner} /> Loading…
        </div>
      ) : domains.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] py-10 text-[var(--color-muted-fg)]">
          <Globe className="h-8 w-8 opacity-50" />
          <p className="text-sm">No custom domains yet.</p>
        </div>
      ) : (
        domains.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-white p-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                <Globe className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className={flexGap2}>
                  <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">
                    {d.domain}
                  </p>
                  {d.is_primary ? (
                    <span className={`${chipCls} bg-amber-100 text-amber-700`}>
                      <Star className="h-3 w-3" /> Primary
                    </span>
                  ) : (
                    <span className={`${chipCls} bg-emerald-100 text-emerald-700`}>
                      {d.verification_status === "verified" ? "Verified" : d.verification_status}
                    </span>
                  )}
                </div>
                <p className={mutedXs}>
                  Added {new Date(d.created_at).toLocaleDateString()}
                  {d.ssl_status ? ` · SSL ${d.ssl_status}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {!d.is_primary && (
                <button
                  type="button"
                  onClick={() => setPrimary(d)}
                  className="rounded-md px-2 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
                >
                  Make primary
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(d)}
                className="rounded-md p-1.5 text-[var(--color-muted-fg)] hover:bg-rose-50 hover:text-rose-600"
                aria-label="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
