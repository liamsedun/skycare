import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getClaims } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Exchange the OAuth code for a session, then route by role. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[auth/callback]", error.message);
    return NextResponse.redirect(`${origin}/login?error=auth_callback`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A social sign-in (Google / Yahoo / iCloud) that doesn't match an existing
  // hospital account produces a fresh auth user with no role claim. Block it
  // instead of dropping the user into an empty portal.
  if (!user || !user.app_metadata?.role) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=oauth_no_account`);
  }

  const claims = getClaims(user);
  const next = url.searchParams.get("next");
  const target =
    next && next.startsWith("/")
      ? next
      : claims.role === "patient_api"
        ? "/patient"
        : "/app";
  return NextResponse.redirect(`${origin}${target}`);
}
