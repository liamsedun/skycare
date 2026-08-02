import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "skycare.app";

export type TenantContext = {
  slug: string | null;      // subdomain or custom domain
  isRoot: boolean;          // true on www / apex (marketing site)
  customDomain: boolean;
};

export function resolveTenantSlug(host?: string | null): TenantContext {
  const h = (host ?? "").replace(/^https?:\/\//, "").split(":")[0].toLowerCase();
  if (!h || h === ROOT_DOMAIN || h === `www.${ROOT_DOMAIN}`) {
    return { slug: null, isRoot: true, customDomain: false };
  }
  // custom domain set by tenant → resolve via DB (handled in loadTenant)
  if (!h.endsWith(`.${ROOT_DOMAIN}`)) {
    return { slug: h, isRoot: false, customDomain: true };
  }
  const slug = h.replace(`.${ROOT_DOMAIN}`, "");
  return { slug, isRoot: false, customDomain: false };
}

/** Server-side tenant loader used by hospital website routes. */
export async function loadTenant(host?: string | null) {
  const ctx = resolveTenantSlug(host);
  const supabase = await createClient();

  if (ctx.customDomain) {
    const { data } = await supabase
      .from("tenants")
      .select("*")
      .eq("domain", ctx.slug)
      .eq("is_active", true)
      .maybeSingle();
    return { ctx, tenant: data ?? null };
  }
  if (!ctx.isRoot && ctx.slug) {
    const { data } = await supabase
      .from("tenants")
      .select("*")
      .eq("slug", ctx.slug)
      .eq("is_active", true)
      .maybeSingle();
    return { ctx, tenant: data ?? null };
  }
  return { ctx, tenant: null };
}

export async function getHost() {
  const h = await headers();
  return h.get("x-forwarded-host") ?? h.get("host");
}