import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import { requireModulePage } from "@/lib/module-guard";
import DischargesView from "@/components/dashboard/discharges-view";

export const dynamic = "force-dynamic";

const WARD_ROLES = ["hospital_admin", "doctor", "nurse", "super_admin"];

export default async function DischargesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/wards/discharges");

  const accessLevel = await requireModulePage(supabase, user, "wards-discharges", WARD_ROLES);
  const role = getClaims(user).role as StaffRole | undefined;
  const viewOnly = accessLevel === "view_only";

  return (
    <div className="space-y-6">
      <DischargesView accessLevel={accessLevel} canBill={!viewOnly && (role === "hospital_admin" || role === "super_admin")} />
    </div>
  );
}