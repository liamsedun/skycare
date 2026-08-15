"use client";

import { useEffect, useState } from "react";

export interface TenantBranding {
  name: string;
  logo_url: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  currency: string;
  website: string | null;
}

/**
 * Loads the tenant's branding for bills/receipts letterheads. Any authenticated
 * user (staff or patient) may read it. Returns null on failure — callers fall
 * back to the generic "SkyCare HMS" label.
 */
export function useTenantBranding(): { branding: TenantBranding | null; loading: boolean } {
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/tenant/branding", { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (alive && body.data) setBranding(body.data as TenantBranding);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { branding, loading };
}