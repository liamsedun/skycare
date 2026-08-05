import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, isStaffRole } from "@/lib/auth";
import AppShell from "@/components/dashboard/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const claims = getClaims(user);
  if (!user || !isStaffRole(claims.role)) {
    redirect("/login?redirect=/app");
  }
  const role = claims.role;

  const [profileRes, tenantRes] = await Promise.all([
    supabase.from("users").select("full_name, is_active").eq("id", user.id).maybeSingle(),
    claims.tenantId
      ? supabase.from("tenants").select("name").eq("id", claims.tenantId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Deactivated accounts are bounced even with a valid auth session.
  if (profileRes.data && profileRes.data.is_active === false) {
    const supabaseBrowser = (await import("@/lib/supabase/client")).getSupabase();
    await supabaseBrowser.auth.signOut();
    redirect("/login?disabled=1");
  }

  const userName = profileRes.data?.full_name ?? user.email ?? "Staff";
  const tenantName = tenantRes.data?.name ?? null;

  return (
    <AppShell role={role} tenantName={tenantName} userName={userName}>
      {children}
    </AppShell>
  );
}
