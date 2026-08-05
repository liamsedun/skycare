import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import StaffManagement from "@/components/dashboard/staff-management";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/staff");

  const claims = getClaims(user);
  const role = claims.role as StaffRole | undefined;
  if (role !== "hospital_admin" && role !== "super_admin") {
    redirect("/app");
  }

  return <StaffManagement meId={user.id} />;
}
