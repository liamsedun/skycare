"use client";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "skycare.app";
const LOCAL_DOMAIN = process.env.NEXT_PUBLIC_LOCAL_DOMAIN ?? "skycare.test";

/**
 * URL of a tenant's public website.
 * Production: https://<slug>.skycare.app/
 * Local dev:  http://localhost:<port>/<slug>/  (path-based, no subdomain DNS)
 * Used to send signed-out patients back to their hospital's website.
 */
export function tenantHomeUrl(slug: string): string {
  const { protocol, hostname, port } = window.location;
  const h = hostname.toLowerCase();
  if (h === ROOT_DOMAIN || h.endsWith(`.${ROOT_DOMAIN}`)) return `https://${slug}.${ROOT_DOMAIN}/`;
  if (h === LOCAL_DOMAIN || h.endsWith(`.${LOCAL_DOMAIN}`)) return `${protocol}//${slug}.${LOCAL_DOMAIN}${port ? `:${port}` : ""}/`;
  // Direct localhost access (no subdomain) — use path-based URL.
  return `${protocol}//${hostname}${port ? `:${port}` : ""}/${slug}`;
}