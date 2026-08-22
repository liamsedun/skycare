import { describe, it, expect, vi } from "vitest";
import {
  TTL,
  tenantKey,
  tenantTag,
  TAGS,
  recordCacheHit,
  recordCacheMiss,
  getCacheStats,
  invalidateTenantCache,
  invalidateServicesCache,
  invalidateDepartmentsCache,
  invalidateDoctorsCache,
  invalidateLabCatalogCache,
  invalidatePharmacyCatalogCache,
  invalidateBranchesCache,
  invalidateBankAccountsCache,
  invalidateBrandingCache,
  invalidateWebsiteCache,
} from "@/lib/cache";

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                order: () => ({ data: [], error: null }),
              }),
              maybeSingle: () => ({ data: null, error: null }),
            }),
            order: () => ({
              order: () => ({ data: [], error: null }),
            }),
          }),
          maybeSingle: () => ({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>, _keys: string[], _opts: unknown) => fn,
  revalidateTag: vi.fn(),
}));

describe("cache utilities", () => {
  it("tenantKey builds correct key", () => {
    expect(tenantKey("tid-123", "services")).toBe("tenant:tid-123:services");
  });

  it("tenantTag builds correct tag", () => {
    expect(tenantTag("tid-123", "branding")).toBe("tenant:tid-123:branding");
  });

  it("TAGS has expected values", () => {
    expect(TAGS.branding).toBe("branding");
    expect(TAGS.website).toBe("website");
    expect(TAGS.services).toBe("services");
    expect(TAGS.departments).toBe("departments");
    expect(TAGS.doctors).toBe("doctors");
    expect(TAGS.labCatalog).toBe("lab-catalog");
    expect(TAGS.pharmacyCatalog).toBe("pharmacy-catalog");
    expect(TAGS.bankAccounts).toBe("bank-accounts");
    expect(TAGS.branches).toBe("branches");
    expect(TAGS.settings).toBe("settings");
  });

  it("TTL has expected values", () => {
    expect(TTL.BRANDING).toBe(3600);
    expect(TTL.WEBSITE).toBe(1800);
    expect(TTL.DOCTORS).toBe(1800);
    expect(TTL.LAB_CATALOG).toBe(900);
    expect(TTL.PHARMACY_CATALOG).toBe(600);
    expect(TTL.BANK_ACCOUNTS).toBe(300);
    expect(TTL.BRANCHES).toBe(300);
    expect(TTL.DASHBOARD).toBe(30);
  });
});

describe("cache monitoring", () => {
  it("tracks hits and misses", () => {
    const before = getCacheStats();
    recordCacheHit();
    recordCacheHit();
    recordCacheMiss();
    const after = getCacheStats();
    expect(after.hits).toBe(before.hits + 2);
    expect(after.misses).toBe(before.misses + 1);
  });

  it("calculates hit rate", () => {
    const stats = getCacheStats();
    expect(typeof stats.hitRate).toBe("number");
    expect(stats.hitRate).toBeGreaterThanOrEqual(0);
    expect(stats.hitRate).toBeLessThanOrEqual(100);
  });
});

describe("cache invalidation", () => {
  it("all invalidation functions call revalidateTag", async () => {
    const { revalidateTag } = await import("next/cache");
    const mock = vi.mocked(revalidateTag);
    mock.mockClear();

    await invalidateTenantCache("t1", "slug1");
    expect(mock).toHaveBeenCalled();

    mock.mockClear();
    await invalidateServicesCache("t1");
    await invalidateDepartmentsCache("t1");
    await invalidateDoctorsCache("t1");
    await invalidateLabCatalogCache("t1");
    await invalidatePharmacyCatalogCache("t1");
    await invalidateBranchesCache("t1");
    await invalidateBankAccountsCache("t1");
    await invalidateBrandingCache("t1", "s");
    await invalidateWebsiteCache("t1");
    expect(mock).toHaveBeenCalledTimes(10);
  });
});
