import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import LabView from "@/components/dashboard/lab-view";

export const dynamic = "force-dynamic";

export default async function LabRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/lab/requests");

  const role = getClaims(user).role as StaffRole | undefined;
  if (!["hospital_admin", "doctor", "nurse", "lab_tech", "super_admin"].includes(role ?? "")) {
    redirect("/app");
  }

  return (
    <LabView
      initialTab="requests"
      canManageCatalog={role === "hospital_admin" || role === "super_admin"}
      canEditService={role === "lab_tech" || role === "hospital_admin" || role === "super_admin"}
      canEnterResults={role === "lab_tech" || role === "hospital_admin" || role === "super_admin" || role === "doctor"}
      canBill={role === "hospital_admin" || role === "super_admin"}
    />
  );
}