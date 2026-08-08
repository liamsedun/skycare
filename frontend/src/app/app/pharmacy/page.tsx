import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import PharmacyView from "@/components/dashboard/pharmacy-view";
import PharmacyAdminView from "@/components/dashboard/pharmacy-admin-view";
import PharmacyBillingView from "@/components/dashboard/pharmacy-billing-view";
import PharmacyComplianceView from "@/components/dashboard/pharmacy-compliance-view";
import PharmacyAiView from "@/components/dashboard/pharmacy-ai-view";
import PharmacyAnalyticsView from "@/components/dashboard/pharmacy-analytics-view";

export const dynamic = "force-dynamic";

export default async function PharmacyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/pharmacy");

  const role = getClaims(user).role as StaffRole | undefined;
  if (!["hospital_admin", "doctor", "nurse", "pharmacist", "super_admin"].includes(role ?? "")) {
    redirect("/app");
  }

  const canAdmin = role === "hospital_admin" || role === "super_admin";
  const canBill = role === "hospital_admin" || role === "super_admin" || role === "pharmacist" || role === "cashier";
  const canCompliance = role === "hospital_admin" || role === "super_admin" || role === "pharmacist";
  const canAnalytics = role === "hospital_admin" || role === "super_admin" || role === "pharmacist";

  return (
    <div className="space-y-6">
      <PharmacyView canDispense={role === "pharmacist" || role === "hospital_admin" || role === "super_admin"} />
      <PharmacyAiView />
      {canAnalytics && <PharmacyAnalyticsView />}
      {canBill && <PharmacyBillingView />}
      {canCompliance && <PharmacyComplianceView />}
      {canAdmin && <PharmacyAdminView />}
    </div>
  );
}
