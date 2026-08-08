import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import AdmissionsView from "@/components/dashboard/admissions-view";

export const dynamic = "force-dynamic";

const WARD_ROLES = ["hospital_admin", "doctor", "nurse", "receptionist", "super_admin"];

export default async function AdmissionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/wards/admissions");

  const role = getClaims(user).role as StaffRole | undefined;
  if (!WARD_ROLES.includes(role ?? "")) redirect("/app");

  return (
    <div className="space-y-6">
      <AdmissionsView />
    </div>
  );
}