import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import PharmacyAnalyticsView from "@/components/dashboard/pharmacy-analytics-view";

export const dynamic = "force-dynamic";

export default async function PharmacyDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/pharmacy/dashboard");

  const role = getClaims(user).role as StaffRole | undefined;
  if (!["hospital_admin", "pharmacist", "super_admin"].includes(role ?? "")) {
    redirect("/app");
  }

  return (
    <div className="space-y-6">
      <PharmacyAnalyticsView />
    </div>
  );
}