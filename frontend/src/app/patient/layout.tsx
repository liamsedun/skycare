import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims } from "@/lib/auth";
import PatientShell from "@/components/patient/patient-shell";

export const dynamic = "force-dynamic";

export default async function PatientLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const claims = getClaims(user);
  if (!user || claims.role !== "patient_api") {
    redirect("/login?redirect=/patient");
  }

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

  const userName = profileRes.data?.full_name ?? user.email ?? "Patient";
  const tenantName = tenantRes.data?.name ?? null;

  return (
    <PatientShell tenantName={tenantName} userName={userName}>
      {children}
    </PatientShell>
  );
}
