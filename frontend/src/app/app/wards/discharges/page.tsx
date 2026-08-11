import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import DischargesView from "@/components/dashboard/discharges-view";

export const dynamic = "force-dynamic";

const WARD_ROLES = ["hospital_admin", "doctor", "nurse", "super_admin"];

export default async function DischargesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/wards/discharges");

  const role = getClaims(user).role as StaffRole | undefined;
  if (!WARD_ROLES.includes(role ?? "")) redirect("/app");

  return (
    <div className="space-y-6">
      <DischargesView canBill={role === "hospital_admin" || role === "super_admin"} />
    </div>
  );
}