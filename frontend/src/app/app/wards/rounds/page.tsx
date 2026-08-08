import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import WardRoundsView from "@/components/dashboard/ward-rounds-view";

export const dynamic = "force-dynamic";

const WARD_ROLES = ["hospital_admin", "doctor", "nurse", "super_admin"];

export default async function WardRoundsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/wards/rounds");

  const role = getClaims(user).role as StaffRole | undefined;
  if (!WARD_ROLES.includes(role ?? "")) redirect("/app");

  return (
    <div className="space-y-6">
      <WardRoundsView />
    </div>
  );
}