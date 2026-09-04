import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import { requireModulePage } from "@/lib/module-guard";
import StaffManagement from "@/components/dashboard/staff-management";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/staff");

  const accessLevel = await requireModulePage(supabase, user, "staff", ["hospital_admin"]);
  const role = getClaims(user).role as StaffRole | undefined;

  return <StaffManagement meId={user.id} myRole={role} accessLevel={accessLevel} />;
}
