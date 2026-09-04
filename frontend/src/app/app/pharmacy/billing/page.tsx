import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import { requireModulePage } from "@/lib/module-guard";
import PharmacyBillingView from "@/components/dashboard/pharmacy-billing-view";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/pharmacy/billing");

  const accessLevel = await requireModulePage(supabase, user, "pharmacy-billing", ["hospital_admin", "pharmacist", "cashier"]);
  const role = getClaims(user).role as StaffRole | undefined;

  return (
    <div className="space-y-6">
      <PharmacyBillingView accessLevel={accessLevel} myRole={role} />
    </div>
  );
}