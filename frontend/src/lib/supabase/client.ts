"use client";

import { createBrowserClient } from "@supabase/ssr";
import { cookieDomainForHost } from "@/lib/cookie-domain";

let client: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Lazily created singleton browser client. Env vars are only read when a
 * browser actually uses auth, so server-side module evaluation (prerender)
 * never throws when env vars are absent. On tenant subdomains the auth cookie
 * is scoped to the shared parent domain so a sign-in survives the proxy's
 * subdomain -> root redirect of /app (see cookie-domain.ts).
 */
export function getSupabase() {
  if (!client) {
    const domain =
      typeof window !== "undefined" ? cookieDomainForHost(window.location.hostname) : undefined;
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      domain ? { cookieOptions: { domain } } : undefined
    );
  }
  return client;
}
