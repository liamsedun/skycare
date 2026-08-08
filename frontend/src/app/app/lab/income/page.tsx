import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import LabIncomeView from "@/components/dashboard/lab-income-view";

export const dynamic = "force-dynamic";

export default async function LabIncomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/lab/income");

  const role = getClaims(user).role as StaffRole | undefined;
  if (!["hospital_admin", "lab_tech", "super_admin"].includes(role ?? "")) {
    redirect("/app");
  }

  return (
    <div className="space-y-6">
      <LabIncomeView />
    </div>
  );
}