import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import { requireModulePage } from "@/lib/module-guard";
import BillingView from "@/components/dashboard/billing-view";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/billing");

  const accessLevel = await requireModulePage(supabase, user, "billing", ["hospital_admin", "cashier"]);
  const role = getClaims(user).role as StaffRole | undefined;

  return <BillingView accessLevel={accessLevel} myRole={role} />;
}
