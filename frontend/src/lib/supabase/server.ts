import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { cookieDomainForHost } from "@/lib/cookie-domain";

export async function createClient() {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const domain = cookieDomainForHost(headerStore.get("x-forwarded-host") ?? headerStore.get("host"));

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: domain ? { domain } : undefined,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, { ...options, ...(domain ? { domain } : {}) })
          );
        },
      },
    }
  );
}

export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Reads the staff role straight from the supabase-ssr auth cookie's JWT
 * without a GoTrue round trip. The cookie was already validated by the proxy
 * and the /app layout during the same request; a decode failure returns
 * undefined so callers can fall back to the authoritative getUser() path.
 */
export function getRoleFromAuthCookie(cookieValue: string | undefined): string | undefined {
  if (!cookieValue) return undefined;
  try {
    const parsed = JSON.parse(cookieValue) as { access_token?: string };
    const payload = parsed.access_token?.split(".")[1];
    if (!payload) return undefined;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      app_metadata?: { role?: string };
    };
    return claims.app_metadata?.role;
  } catch {
    return undefined;
  }
}