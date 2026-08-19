import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "skycare.app";
const LOCAL_DOMAIN = process.env.NEXT_PUBLIC_LOCAL_DOMAIN ?? "skycare.test";

// Top-level routes that must never be treated as tenant slugs in path mode.
const ROOT_ONLY_PREFIXES = ["/api", "/app", "/patient", "/login", "/signup", "/verify", "/auth"];

// Same host resolution as the tenant pages (getHost in lib/tenant.ts): the
// Host headers win so smoke tests against localhost with a host header work,
// and the URL hostname is only a fallback.
function requestHost(request: NextRequest) {
  const h =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.hostname;
  return h.split(":")[0];
}

export async function proxy(request: NextRequest) {
  const hostname = requestHost(request).toLowerCase();

  // ---- Tenant subdomain: <slug>.<ROOT_DOMAIN> or <slug>.<LOCAL_DOMAIN> ----
  const subdomainSuffix = hostname.endsWith(`.${ROOT_DOMAIN}`)
    ? ROOT_DOMAIN
    : hostname.endsWith(`.${LOCAL_DOMAIN}`)
      ? LOCAL_DOMAIN
      : null;
  if (subdomainSuffix) {
    const slug = hostname.slice(0, -(subdomainSuffix.length + 1));
    if (slug && !slug.includes(".")) {
      const { pathname } = request.nextUrl;

      // Staff/patient apps, auth and API routes live on the root domain
      if (ROOT_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
        const url = request.nextUrl.clone();
        if (subdomainSuffix === LOCAL_DOMAIN) {
          // Local development: keep the http scheme + port, just drop the subdomain
          url.hostname = LOCAL_DOMAIN;
        } else {
          url.protocol = "https:";
          url.host = ROOT_DOMAIN;
        }
        return NextResponse.redirect(url);
      }

      // Idempotent: strip a duplicated slug prefix
      // (<slug>.skycare.app/<slug>/book -> /book)
      let rest = pathname;
      if (rest === `/${slug}` || rest.startsWith(`/${slug}/`)) {
        rest = rest.slice(slug.length + 1) || "/";
      }
      if (rest === "/") rest = "";

      const url = request.nextUrl.clone();
      url.pathname = `/${slug}${rest}`;
      return NextResponse.rewrite(url);
    }
  }

  // Everything else keeps the previous behaviour: session refresh only for
  // the staff app and login (authoritative guards stay in the layouts).
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/app") || pathname === "/login") {
    return await updateSession(request);
  }
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    // Run on everything except static assets, images, fonts and favicons.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|woff2?)$).*)",
  ],
};