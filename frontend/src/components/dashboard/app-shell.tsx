"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/dashboard/sidebar";
import Topbar from "@/components/dashboard/topbar";
import MobileNav from "@/components/dashboard/mobile-nav";
import { CurrencyProvider } from "@/lib/currency";
import { BranchProvider } from "@/lib/branch-context";
import type { StaffRole } from "@/lib/auth";
import type { ModuleAccess } from "@/lib/nav";

export default function AppShell({
  role,
  moduleAccess,
  tenantName,
  userName,
  tenantLogoUrl,
  avatarUrl,
  websiteProvisioned,
  children,
}: Readonly<{
  role: StaffRole;
  moduleAccess?: ModuleAccess;
  tenantName: string | null;
  userName: string;
  tenantLogoUrl: string | null;
  avatarUrl: string | null;
  websiteProvisioned: boolean | null;
  children: React.ReactNode;
}>) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Phase 4 first-run flow: admins whose tenant has NOT provisioned their
  // default website are routed to the onboarding wizard once on the staff
  // portal (unless already there). Non-admin staff skip it entirely.
  const isAdmin = role === "hospital_admin";
  useEffect(() => {
    if (
      websiteProvisioned === false &&
      isAdmin &&
      websiteProvisioned !== null &&
      pathname !== "/app/onboarding"
    ) {
      router.replace("/app/onboarding");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [websiteProvisioned, pathname]);

  return (
    <BranchProvider>
    <CurrencyProvider>
    <div className="flex min-h-screen w-full">
      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
          <div className="absolute inset-y-0 left-0 shadow-[var(--shadow-xl)]">
            <Sidebar role={role} moduleAccess={moduleAccess} tenantName={tenantName} onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen shrink-0 md:block">
        <Sidebar role={role} moduleAccess={moduleAccess} tenantName={tenantName} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userName={userName} role={role} tenantName={tenantName} tenantLogoUrl={tenantLogoUrl} avatarUrl={avatarUrl} onOpenSidebar={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 pb-28 sm:px-6 md:pb-6 lg:px-8">
          {children}
        </main>
        <MobileNav role={role} moduleAccess={moduleAccess} />
      </div>
    </div>
    </CurrencyProvider>
    </BranchProvider>
  );
}
