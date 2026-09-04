import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import { requireModulePage } from "@/lib/module-guard";
import WardDashboardView from "@/components/dashboard/ward-dashboard-view";

export const dynamic = "force-dynamic";

const WARD_ROLES = ["hospital_admin", "doctor", "nurse"];

export default async function WardsDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/wards/dashboard");

  const accessLevel = await requireModulePage(supabase, user, "wards-dashboard", WARD_ROLES);
  const role = getClaims(user).role as StaffRole | undefined;

  return (
    <div className="space-y-6">
      <WardDashboardView accessLevel={accessLevel} myRole={role} />
    </div>
  );
}