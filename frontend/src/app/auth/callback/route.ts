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
