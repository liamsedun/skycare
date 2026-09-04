import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import { requireModulePage } from "@/lib/module-guard";
import BedMapView from "@/components/dashboard/bed-map-view";

export const dynamic = "force-dynamic";

const WARD_ROLES = ["hospital_admin", "doctor", "nurse", "receptionist"];

export default async function BedMapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/wards/bed-map");

  const accessLevel = await requireModulePage(supabase, user, "wards-bed-map", WARD_ROLES);
  const role = getClaims(user).role as StaffRole | undefined;
  const viewOnly = accessLevel === "view_only";

  return (
    <div className="space-y-6">
      <BedMapView accessLevel={accessLevel} canManage={!viewOnly && (role === "hospital_admin")} />
    </div>
  );
}