import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import { requireModulePage } from "@/lib/module-guard";
import PharmacyView from "@/components/dashboard/pharmacy-view";

export const dynamic = "force-dynamic";

export default async function PrescriptionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/pharmacy/prescriptions");

  const accessLevel = await requireModulePage(supabase, user, "pharmacy-prescriptions", ["hospital_admin", "doctor", "nurse", "pharmacist", "super_admin"]);
  const role = getClaims(user).role as StaffRole | undefined;
  const viewOnly = accessLevel === "view_only";

  return (
    <div className="space-y-6">
      <PharmacyView
        accessLevel={accessLevel}
        canDispense={!viewOnly && (role === "pharmacist" || role === "hospital_admin" || role === "super_admin")}
      />
    </div>
  );
}