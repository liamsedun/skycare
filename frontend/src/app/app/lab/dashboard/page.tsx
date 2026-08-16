import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import { requireModulePage } from "@/lib/module-guard";
import LabDashboardView from "@/components/dashboard/lab-dashboard-view";

export const dynamic = "force-dynamic";

export default async function LabDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/lab/dashboard");

  const accessLevel = await requireModulePage(supabase, user, "lab-dashboard", ["hospital_admin", "lab_tech", "super_admin"]);
  const role = getClaims(user).role as StaffRole | undefined;

  return (
    <div className="space-y-6">
      <LabDashboardView accessLevel={accessLevel} myRole={role} />
    </div>
  );
}