import DashboardView from "@/components/dashboard/dashboard-view";
import { cookies } from "next/headers";
import { createClient, getRoleFromAuthCookie } from "@/lib/supabase/server";
import { getClaims } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  // myRole is a UI hint only �?" read it from the auth cookie JWT (already
  // validated by the proxy + layout this request) to skip a third GoTrue
  // getUser() round trip on every /app load. Fall back to getUser() on any
  // decode failure.
  const cookieStore = await cookies();
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  let myRole = getRoleFromAuthCookie(cookieStore.get(`sb-${ref}-auth-token`)?.value);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!myRole) myRole = user ? getClaims(user).role : undefined;

  const { data: profile } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  return (
    <DashboardView
      myRole={myRole}
      fullName={profile?.full_name ?? user?.email ?? "there"}
    />
  );
}