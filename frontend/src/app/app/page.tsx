import DashboardView from "@/components/dashboard/dashboard-view";
import { createClient } from "@/lib/supabase/server";
import { getClaims } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myRole = user ? getClaims(user).role : undefined;
  return <DashboardView myRole={myRole} />;
}