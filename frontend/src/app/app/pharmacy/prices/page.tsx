import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClaims, type StaffRole } from "@/lib/auth";
import { BranchAdminTabs } from "@/components/dashboard/pharmacy-admin-view";

export const dynamic = "force-dynamic";

export default async function BranchPricesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/app/pharmacy/prices");

  const role = getClaims(user).role as StaffRole | undefined;
  if (!["hospital_admin", "super_admin"].includes(role ?? "")) {
    redirect("/app");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Branch Prices</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
          Per-branch retail price overrides for the pharmacy catalogue.
        </p>
      </div>
      <BranchAdminTabs />
    </div>
  );
}