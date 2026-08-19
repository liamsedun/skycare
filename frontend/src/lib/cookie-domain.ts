// Parent-domain scoping for the Supabase auth cookie. The proxy serves the
// staff/patient apps, API and the root login on the ROOT domain and 307-redirects
// those prefixes off tenant subdomains. A session signed in from the tenant
// login page ([slug]/login) must therefore be written with Domain=<parent> so it
// survives the subdomain -> root redirect instead of being dropped (host-only
// cookies are scoped to a single host).
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "skycare.app";
const LOCAL_DOMAIN = process.env.NEXT_PUBLIC_LOCAL_DOMAIN ?? "skycare.test";

export function cookieDomainForHost(host: string | undefined | null): string | undefined {
  if (!host) return undefined;
  const h = host.replace(/^https?:\/\//, "").split(":")[0].toLowerCase();
  if (h.endsWith(`.${ROOT_DOMAIN}`)) return ROOT_DOMAIN;
  if (h.endsWith(`.${LOCAL_DOMAIN}`)) return LOCAL_DOMAIN;
  return undefined;
}

export function hasParentDomain(host: string | undefined | null): boolean {
  return Boolean(cookieDomainForHost(host));
}