"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { PATIENT_NAV_ITEMS } from "@/lib/patient-nav";
import { PatientMobileNav } from "@/components/dashboard/mobile-nav";
import NotificationsBell from "@/components/notifications-bell";
import PatientUserMenu from "@/components/patient/patient-user-menu";
import { SkyCareMark } from "@/components/landing/skycare-logo";

export default function PatientShell({
  tenantName,
  userName,
  tenantLogoUrl,
  avatarUrl,
  children,
}: Readonly<{
  tenantName: string | null;
  userName: string;
  tenantLogoUrl: string | null;
  avatarUrl: string | null;
  children: React.ReactNode;
}>) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const nav = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Patient navigation">
      {PATIENT_NAV_ITEMS.map((item) => {
        const active = item.href === "/patient" ? pathname === "/patient" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`focus-ring flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
              active
                ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]"
                : "text-[var(--color-foreground)] hover:bg-slate-50"
            }`}
          >
            <Icon size={18} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href="/patient" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
      <SkyCareMark size={36} rounded="rounded-xl" />
      <span className="text-lg font-bold">
        <span className="text-slate-900">Sky</span><span className="text-sky-600">Care</span>
      </span>
    </Link>
  );

  return (
    <div className="flex min-h-screen w-full">
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
          <div className="absolute inset-y-0 left-0 shadow-[var(--shadow-xl)]">
            <aside className="flex h-full w-64 flex-col border-r border-[var(--color-border)] bg-white">
              <div className="flex h-16 items-center justify-between border-b border-[var(--color-border)] px-4">
                {brand}
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="focus-ring -mr-1 rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100 md:hidden"
                  aria-label="Close navigation"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
              <div className="border-b border-[var(--color-border)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
                  Hospital
                </p>
                <p className="mt-0.5 truncate text-sm font-medium" title={tenantName ?? undefined}>
                  {tenantName ?? "SkyCare"}
                </p>
              </div>
              {nav}
            </aside>
          </div>
        </div>
      )}

      <aside className="sticky top-0 hidden h-screen shrink-0 md:block">
        <div className="flex h-full w-64 flex-col border-r border-[var(--color-border)] bg-white">
          <div className="flex h-16 items-center border-b border-[var(--color-border)] px-4">{brand}</div>
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
              Hospital
            </p>
            <p className="mt-0.5 truncate text-sm font-medium" title={tenantName ?? undefined}>
              {tenantName ?? "SkyCare"}
            </p>
          </div>
          {nav}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="focus-ring -ml-1 rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100 md:hidden"
              aria-label="Open navigation"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            {tenantLogoUrl && (
              <img
                src={tenantLogoUrl}
                alt=""
                className="max-h-9 max-w-9 shrink-0 rounded-lg object-contain"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            )}
            <span className="truncate text-base font-semibold sm:text-lg" title={tenantName ?? undefined}>
              {tenantName ?? "SkyCare"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-primary-dark)] sm:inline-block">
              Patient
            </span>
            <NotificationsBell basePath="/patient" />
            <PatientUserMenu userName={userName} avatarUrl={avatarUrl} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 pb-28 sm:px-6 md:pb-6 lg:px-8">{children}</main>
      </div>
      <PatientMobileNav />
    </div>
  );
}
