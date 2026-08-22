import { headers } from "next/headers";
import { getCachedTenant, getCachedTenantByDomain } from "@/lib/cache";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "skycare.app";
// Local-development subdomain suffix (.test is reserved, never HSTS-preloaded) so
// tenant sites can be viewed in a browser without hitting the .app HTTPS lock.
const LOCAL_DOMAIN = process.env.NEXT_PUBLIC_LOCAL_DOMAIN ?? "skycare.test";

export type TenantContext = {
  slug: string | null;      // subdomain or custom domain
  isRoot: boolean;          // true on www / apex (marketing site)
  customDomain: boolean;
};

export function resolveTenantSlug(host?: string | null): TenantContext {
  const h = (host ?? "").replace(/^https?:\/\//, "").split(":")[0].toLowerCase();
  if (!h || h === ROOT_DOMAIN || h === `www.${ROOT_DOMAIN}` || h === LOCAL_DOMAIN || h === `www.${LOCAL_DOMAIN}` || h === "localhost") {
    return { slug: null, isRoot: true, customDomain: false };
  }
  // custom domain set by tenant → resolve via DB (handled in loadTenant)
  if (!h.endsWith(`.${ROOT_DOMAIN}`) && !h.endsWith(`.${LOCAL_DOMAIN}`)) {
    return { slug: h, isRoot: false, customDomain: true };
  }
  const suffix = h.endsWith(`.${LOCAL_DOMAIN}`) ? LOCAL_DOMAIN : ROOT_DOMAIN;
  const slug = h.replace(`.${suffix}`, "");
  return { slug, isRoot: false, customDomain: false };
}

/** Server-side tenant loader used by hospital website routes. */
export async function loadTenant(host?: string | null) {
  const ctx = resolveTenantSlug(host);

  // Anonymous callers read the curated public profile view (migration 0088);
  // the raw `tenants` table (incl. `settings` with Paystack keys) is never
  // exposed to anon — the view whitelists brand/contact/website content only.
  if (ctx.customDomain) {
    // On localhost, the "host" is actually the slug from the URL params.
    // Try slug first, then fall back to domain lookup.
    const data = await getCachedTenant(ctx.slug!);
    if (data) return { ctx, tenant: data };
    const byDomain = await getCachedTenantByDomain(ctx.slug!);
    return { ctx, tenant: byDomain ?? null };
  }
  if (!ctx.isRoot && ctx.slug) {
    const data = await getCachedTenant(ctx.slug);
    return { ctx, tenant: data ?? null };
  }
  return { ctx, tenant: null };
}

export async function getHost() {
  const h = await headers();
  return h.get("x-forwarded-host") ?? h.get("host");
}