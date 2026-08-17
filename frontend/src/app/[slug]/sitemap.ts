import type { MetadataRoute } from "next";
import { getHost, loadTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "skycare.app";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${ROOT_DOMAIN}`;

// NOTE: never destructure the first argument here. Next 16.3 calls the
// metadata-file sitemap export WITHOUT arguments, so `({ params })` throws
// "Cannot destructure property 'params' of 'undefined'" -> empty 500 body.
// The tenant is resolved from the host header instead (subdomain mode is the
// production path; on localhost tests send x-forwarded-host).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = await getHost();
  const { ctx, tenant } = await loadTenant(host);
  if (!tenant) return [];

  const base = `${SITE_URL}/${ctx.slug ?? tenant.slug}`;
  const lastModified = new Date();
  const paths = ["", "/about", "/services", "/departments", "/doctors", "/contact", "/book"];

  return paths.map((p) => ({
    url: `${base}${p}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: p === "" ? 1 : 0.8,
  }));
}