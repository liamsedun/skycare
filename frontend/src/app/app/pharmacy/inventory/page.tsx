import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import { requireModulePage } from "@/lib/module-guard";
import PharmacyInventoryShell from "@/components/dashboard/pharmacy-inventory-shell";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/pharmacy/inventory");

  const accessLevel = await requireModulePage(supabase, user, "pharmacy-inventory", ["hospital_admin", "pharmacist", "super_admin"]);
  const role = getClaims(user).role as StaffRole | undefined;

  return (
    <div className="space-y-6">
      <PharmacyInventoryShell accessLevel={accessLevel} myRole={role} />
    </div>
  );
}