"use client";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "skycare.app";
const LOCAL_DOMAIN = process.env.NEXT_PUBLIC_LOCAL_DOMAIN ?? "skycare.test";

/**
 * Absolute URL of a tenant's public website, derived from the current origin.
 * Production root domain (skycare.app) -> https://<slug>.skycare.app/
 * Local test domain (skycare.test)     -> http://<slug>.skycare.test:<port>/
 * Used to send signed-out patients back to their hospital's website instead of
 * the SaaS marketing root.
 */
export function tenantHomeUrl(slug: string): string {
  const { protocol, hostname, port } = window.location;
  const h = hostname.toLowerCase();
  if (h === ROOT_DOMAIN || h.endsWith(`.${ROOT_DOMAIN}`)) return `https://${slug}.${ROOT_DOMAIN}/`;
  return `${protocol}//${slug}.${LOCAL_DOMAIN}${port ? `:${port}` : ""}/`;
}