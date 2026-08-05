"use client";

import { useState } from "react";
import Sidebar from "@/components/dashboard/sidebar";
import Topbar from "@/components/dashboard/topbar";
import type { StaffRole } from "@/lib/auth";

export default function AppShell({
  role,
  tenantName,
  userName,
  tenantLogoUrl,
  avatarUrl,
  children,
}: Readonly<{
  role: StaffRole;
  tenantName: string | null;
  userName: string;
  tenantLogoUrl: string | null;
  avatarUrl: string | null;
  children: React.ReactNode;
}>) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
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
            <Sidebar role={role} tenantName={tenantName} tenantLogoUrl={tenantLogoUrl} onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen shrink-0 md:block">
        <Sidebar role={role} tenantName={tenantName} tenantLogoUrl={tenantLogoUrl} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userName={userName} role={role} avatarUrl={avatarUrl} onOpenSidebar={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
