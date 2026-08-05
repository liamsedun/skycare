import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import PharmacyView from "@/components/dashboard/pharmacy-view";

export const dynamic = "force-dynamic";

export default async function PharmacyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/pharmacy");

  const role = getClaims(user).role as StaffRole | undefined;
  if (!["hospital_admin", "doctor", "nurse", "pharmacist", "super_admin"].includes(role ?? "")) {
    redirect("/app");
  }

  return <PharmacyView canDispense={role === "pharmacist" || role === "hospital_admin" || role === "super_admin"} />;
}
