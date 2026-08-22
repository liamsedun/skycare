import { unstable_cache, revalidateTag } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

// Cache layer for reference/config data.
// SECURITY: Patient data, clinical records, payments NEVER cached.

export const TTL = {
  BRANDING: 60 * 60,
  WEBSITE: 30 * 60,
  DOCTORS: 30 * 60,
  LAB_CATALOG: 15 * 60,
  PHARMACY_CATALOG: 10 * 60,
  BANK_ACCOUNTS: 5 * 60,
  BRANCHES: 5 * 60,
  SETTINGS: 30 * 60,
  DASHBOARD: 30,
} as const;

export function tenantKey(tenantId: string, key: string): string {
  return `tenant:${tenantId}:${key}`;
}

export function tenantTag(tenantId: string, tag: string): string {
  return `tenant:${tenantId}:${tag}`;
}

export const TAGS = {
  branding: "branding",
  website: "website",
  services: "services",
  departments: "departments",
  doctors: "doctors",
  labCatalog: "lab-catalog",
  pharmacyCatalog: "pharmacy-catalog",
  bankAccounts: "bank-accounts",
  branches: "branches",
  settings: "settings",
  dashboard: "dashboard",
} as const;

// Stampede protection
const inflight = new Map<string, Promise<unknown>>();

async function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = fn().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

// ---- CACHED DATA FETCHERS ----

export async function getCachedTenant(slug: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from("tenant_public_profile")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      return data;
    },
    [`tenant:${slug}`],
    { revalidate: TTL.BRANDING, tags: [`tenant-slug:${slug}`] }
  )();
}

export async function getCachedTenantByDomain(domain: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from("tenant_public_profile")
        .select("*")
        .eq("domain", domain)
        .maybeSingle();
      return data;
    },
    [`tenant-domain:${domain}`],
    { revalidate: TTL.BRANDING, tags: [`tenant-domain:${domain}`] }
  )();
}

export async function getCachedWebsiteServices(tenantId: string) {


  return singleFlight(tenantKey(tenantId, "services"), () =>
    unstable_cache(
      async () => {
        const svc = createServiceClient();
        const { data } = await svc
          .from("website_services")
          .select("id, name, description, icon, image_url, display_order, active")
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .order("display_order", { ascending: true })
          .order("name", { ascending: true });
        return data ?? [];
      },
      [`services:${tenantId}`],
      { revalidate: TTL.WEBSITE, tags: [tenantTag(tenantId, TAGS.services)] }
    )()
  );
}

export async function getCachedWebsiteDepartments(tenantId: string) {


  return singleFlight(tenantKey(tenantId, "departments"), () =>
    unstable_cache(
      async () => {
        const svc = createServiceClient();
        const { data } = await svc
          .from("website_departments")
          .select("id, name, description, icon, image_url, display_order, active")
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .order("display_order", { ascending: true })
          .order("name", { ascending: true });
        return data ?? [];
      },
      [`departments:${tenantId}`],
      { revalidate: TTL.WEBSITE, tags: [tenantTag(tenantId, TAGS.departments)] }
    )()
  );
}

export async function getCachedLandingDoctors(tenantId: string) {


  return singleFlight(tenantKey(tenantId, "doctors"), () =>
    unstable_cache(
      async () => {
        const svc = createServiceClient();
        const { data } = await svc
          .from("landing_doctors")
          .select("id, name, specialty, image_url, available, availability")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });
        return data ?? [];
      },
      [`doctors:${tenantId}`],
      { revalidate: TTL.DOCTORS, tags: [tenantTag(tenantId, TAGS.doctors)] }
    )()
  );
}

export async function getCachedWebsitePage(tenantId: string, pageSlug: string) {


  return unstable_cache(
    async () => {
      const svc = createServiceClient();
      const { data } = await svc
        .from("website_pages")
        .select("title, content")
        .eq("tenant_id", tenantId)
        .eq("slug", pageSlug)
        .eq("published", true)
        .maybeSingle();
      if (!data) return null;
      return { title: data.title, content: (data.content ?? {}) as Record<string, unknown> };
    },
    [`page:${tenantId}:${pageSlug}`],
    { revalidate: TTL.WEBSITE, tags: [tenantTag(tenantId, `page-${pageSlug}`)] }
  )();
}

export async function getCachedLabCatalog(tenantId: string) {


  return singleFlight(tenantKey(tenantId, "lab-catalog"), () =>
    unstable_cache(
      async () => {
        const svc = createServiceClient();
        const { data } = await svc
          .from("lab_services")
          .select("id, name, price, category, is_active, is_custom")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .order("name", { ascending: true });
        return data ?? [];
      },
      [`lab-catalog:${tenantId}`],
      { revalidate: TTL.LAB_CATALOG, tags: [tenantTag(tenantId, TAGS.labCatalog)] }
    )()
  );
}

export async function getCachedPharmacyCatalog(tenantId: string) {


  return singleFlight(tenantKey(tenantId, "pharmacy-catalog"), () =>
    unstable_cache(
      async () => {
        const svc = createServiceClient();
        const { data } = await svc
          .from("pharmacy_drugs")
          .select("id, name, form, unit_price, category")
          .eq("tenant_id", tenantId)
          .order("name", { ascending: true });
        return data ?? [];
      },
      [`pharmacy-catalog:${tenantId}`],
      { revalidate: TTL.PHARMACY_CATALOG, tags: [tenantTag(tenantId, TAGS.pharmacyCatalog)] }
    )()
  );
}

export async function getCachedBranches(tenantId: string) {


  return singleFlight(tenantKey(tenantId, "branches"), () =>
    unstable_cache(
      async () => {
        const svc = createServiceClient();
        const { data } = await svc
          .from("branches")
          .select("id, name, code, is_main, is_active")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .order("is_main", { ascending: false })
          .order("name", { ascending: true });
        return data ?? [];
      },
      [`branches:${tenantId}`],
      { revalidate: TTL.BRANCHES, tags: [tenantTag(tenantId, TAGS.branches)] }
    )()
  );
}

export async function getCachedBankAccounts(tenantId: string) {


  return singleFlight(tenantKey(tenantId, "bank-accounts"), () =>
    unstable_cache(
      async () => {
        const svc = createServiceClient();
        const { data } = await svc
          .from("hospital_bank_accounts")
          .select("id, bank_name, account_name, account_number, is_active")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .order("created_at", { ascending: true });
        return data ?? [];
      },
      [`bank-accounts:${tenantId}`],
      { revalidate: TTL.BANK_ACCOUNTS, tags: [tenantTag(tenantId, TAGS.bankAccounts)] }
    )()
  );
}

// ---- CACHE INVALIDATION ----
// Next.js 16 revalidateTag requires a second arg (cacheLife profile).
// Use "default" for standard invalidation.
const IMMEDIATE = "default";

export async function invalidateTenantCache(tenantId: string, slug?: string) {
  revalidateTag(tenantTag(tenantId, TAGS.branding), IMMEDIATE);
  revalidateTag(tenantTag(tenantId, TAGS.website), IMMEDIATE);
  revalidateTag(tenantTag(tenantId, TAGS.settings), IMMEDIATE);
  if (slug) revalidateTag(`tenant-slug:${slug}`, IMMEDIATE);
}

export async function invalidateBrandingCache(tenantId: string, slug?: string) {
  revalidateTag(tenantTag(tenantId, TAGS.branding), IMMEDIATE);
  if (slug) revalidateTag(`tenant-slug:${slug}`, IMMEDIATE);
}

export async function invalidateWebsiteCache(tenantId: string) {
  revalidateTag(tenantTag(tenantId, TAGS.website), IMMEDIATE);
}

export async function invalidateServicesCache(tenantId: string) {
  revalidateTag(tenantTag(tenantId, TAGS.services), IMMEDIATE);
}

export async function invalidateDepartmentsCache(tenantId: string) {
  revalidateTag(tenantTag(tenantId, TAGS.departments), IMMEDIATE);
}

export async function invalidateDoctorsCache(tenantId: string) {
  revalidateTag(tenantTag(tenantId, TAGS.doctors), IMMEDIATE);
}

export async function invalidateLabCatalogCache(tenantId: string) {
  revalidateTag(tenantTag(tenantId, TAGS.labCatalog), IMMEDIATE);
}

export async function invalidatePharmacyCatalogCache(tenantId: string) {
  revalidateTag(tenantTag(tenantId, TAGS.pharmacyCatalog), IMMEDIATE);
}

export async function invalidateBranchesCache(tenantId: string) {
  revalidateTag(tenantTag(tenantId, TAGS.branches), IMMEDIATE);
}

export async function invalidateBankAccountsCache(tenantId: string) {
  revalidateTag(tenantTag(tenantId, TAGS.bankAccounts), IMMEDIATE);
}

// ---- CACHE MONITORING ----

let cacheHits = 0;
let cacheMisses = 0;

export function recordCacheHit() { cacheHits++; }
export function recordCacheMiss() { cacheMisses++; }
export function getCacheStats() {
  const total = cacheHits + cacheMisses;
  return {
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: total > 0 ? Math.round((cacheHits / total) * 100) : 0,
  };
}
