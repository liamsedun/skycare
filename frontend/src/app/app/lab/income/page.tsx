import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import { requireModulePage } from "@/lib/module-guard";
import LabIncomeView from "@/components/dashboard/lab-income-view";

export const dynamic = "force-dynamic";

export default async function LabIncomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/lab/income");

  const accessLevel = await requireModulePage(supabase, user, "lab-income", ["hospital_admin", "lab_tech"]);
  const role = getClaims(user).role as StaffRole | undefined;

  return (
    <div className="space-y-6">
      <LabIncomeView accessLevel={accessLevel} myRole={role} />
    </div>
  );
}