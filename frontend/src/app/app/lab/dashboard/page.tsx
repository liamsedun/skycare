import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import LabDashboardView from "@/components/dashboard/lab-dashboard-view";

export const dynamic = "force-dynamic";

export default async function LabDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/lab/dashboard");

  const role = getClaims(user).role as StaffRole | undefined;
  if (!["hospital_admin", "lab_tech", "super_admin"].includes(role ?? "")) {
    redirect("/app");
  }

  return (
    <div className="space-y-6">
      <LabDashboardView />
    </div>
  );
}