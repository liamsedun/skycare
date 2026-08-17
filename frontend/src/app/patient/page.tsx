import { createClient } from "@/lib/supabase/server";
import PatientDashboard from "@/components/patient/patient-dashboard";

export const dynamic = "force-dynamic";

export default async function PatientHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, avatar_url")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  return (
    <PatientDashboard
      fullName={profile?.full_name ?? user?.email ?? "there"}
      avatarUrl={profile?.avatar_url ?? null}
    />
  );
}
