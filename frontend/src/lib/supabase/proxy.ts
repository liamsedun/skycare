import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getClaims, isStaffRole } from "@/lib/auth";

/**
 * Optimistic session guard for the staff dashboard.
 * Runs in the proxy layer (Next 16 middleware): refreshes the session,
 * bounces anonymous visitors off /app/* and signed-in staff off /login.
 * Authoritative authorization happens in the /app layout via getUser().
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const claims = getClaims(user);
  const isStaff = isStaffRole(claims.role);

  // Anonymous visitor hitting a protected route → login with return path
  if (pathname.startsWith("/app") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Signed-in non-staff (patient_api) must not reach the staff app
  if (pathname.startsWith("/app") && user && !isStaff) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Signed-in staff hitting the login page → straight into the app
  if (pathname === "/login" && user && isStaff) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  return supabaseResponse;
}
