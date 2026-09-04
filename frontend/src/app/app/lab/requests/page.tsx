import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import { requireModulePage } from "@/lib/module-guard";
import LabView from "@/components/dashboard/lab-view";

export const dynamic = "force-dynamic";

const LAB_ROLES = ["hospital_admin", "doctor", "nurse", "lab_tech"];

export default async function LabRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/lab/requests");

  const accessLevel = await requireModulePage(supabase, user, "lab-requests", LAB_ROLES);
  const role = getClaims(user).role as StaffRole | undefined;
  const viewOnly = accessLevel === "view_only";

  return (
    <LabView
      initialTab="requests"
      canManageCatalog={!viewOnly && (role === "hospital_admin")}
      canEditService={!viewOnly && (role === "lab_tech" || role === "hospital_admin")}
      canEnterResults={!viewOnly && (role === "lab_tech" || role === "hospital_admin" || role === "doctor")}
      canBill={!viewOnly && (role === "hospital_admin")}
    />
  );
}