import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import PharmacyBillingView from "@/components/dashboard/pharmacy-billing-view";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/pharmacy/billing");

  const role = getClaims(user).role as StaffRole | undefined;
  if (!["hospital_admin", "pharmacist", "super_admin", "cashier"].includes(role ?? "")) {
    redirect("/app");
  }

  return (
    <div className="space-y-6">
      <PharmacyBillingView />
    </div>
  );
}