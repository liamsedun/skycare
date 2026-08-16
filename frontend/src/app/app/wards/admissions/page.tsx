import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import { requireModulePage } from "@/lib/module-guard";
import AdmissionsView from "@/components/dashboard/admissions-view";

export const dynamic = "force-dynamic";

const WARD_ROLES = ["hospital_admin", "doctor", "nurse", "receptionist", "super_admin"];

export default async function AdmissionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/wards/admissions");

  const accessLevel = await requireModulePage(supabase, user, "wards-admissions", WARD_ROLES);
  const role = getClaims(user).role as StaffRole | undefined;

  return (
    <div className="space-y-6">
      <AdmissionsView accessLevel={accessLevel} myRole={role} />
    </div>
  );
}