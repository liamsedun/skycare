import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import { requireModulePage } from "@/lib/module-guard";
import PharmacyProcurement from "@/components/dashboard/pharmacy-procurement";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/pharmacy/suppliers");

  const accessLevel = await requireModulePage(supabase, user, "pharmacy-suppliers", ["hospital_admin", "pharmacist", "super_admin"]);
  const role = getClaims(user).role as StaffRole | undefined;

  return (
    <div className="space-y-6">
      <PharmacyProcurement accessLevel={accessLevel} myRole={role} />
    </div>
  );
}