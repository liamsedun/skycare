import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import BillingView from "@/components/dashboard/billing-view";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/billing");

  const role = getClaims(user).role as StaffRole | undefined;
  if (!["hospital_admin", "cashier", "super_admin"].includes(role ?? "")) {
    redirect("/app");
  }

  return <BillingView />;
}
