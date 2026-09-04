import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import { requireModulePage } from "@/lib/module-guard";
import WardRoundsView from "@/components/dashboard/ward-rounds-view";

export const dynamic = "force-dynamic";

const WARD_ROLES = ["hospital_admin", "doctor", "nurse"];

export default async function WardRoundsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/wards/rounds");

  const accessLevel = await requireModulePage(supabase, user, "wards-rounds", WARD_ROLES);
  const role = getClaims(user).role as StaffRole | undefined;

  return (
    <div className="space-y-6">
      <WardRoundsView accessLevel={accessLevel} myRole={role} />
    </div>
  );
}