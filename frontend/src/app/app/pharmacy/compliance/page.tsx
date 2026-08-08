import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import PharmacyComplianceView from "@/components/dashboard/pharmacy-compliance-view";

export const dynamic = "force-dynamic";

export default async function CompliancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/pharmacy/compliance");

  const role = getClaims(user).role as StaffRole | undefined;
  if (!["hospital_admin", "pharmacist", "super_admin"].includes(role ?? "")) {
    redirect("/app");
  }

  return (
    <div className="space-y-6">
      <PharmacyComplianceView />
    </div>
  );
}