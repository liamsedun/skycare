"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HeartPulse, LogOut, Menu, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { initials } from "@/lib/auth";
import { PATIENT_NAV_ITEMS } from "@/lib/patient-nav";
import NotificationsBell from "@/components/notifications-bell";

export default function PatientShell({
  tenantName,
  userName,
  children,
}: Readonly<{
  tenantName: string | null;
  userName: string;
  children: React.ReactNode;
}>) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* best effort */
    }
    router.push("/login");
    router.refresh();
  }

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
      <span className="flex h-9 w-9 items-center justify-center rounded-xl sky-gradient text-white">
        <HeartPulse size={18} aria-hidden="true" />
      </span>
      <span className="font-[family-name:var(--font-heading)] text-lg font-bold">SkyCare</span>
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
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="focus-ring -ml-1 rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100 md:hidden"
              aria-label="Open navigation"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <span className="font-[family-name:var(--font-heading)] text-base font-semibold sm:text-lg">
              {userName.split(/\s+/)[0] ?? "Patient"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-primary-dark)] sm:inline-block">
              Patient
            </span>
            <NotificationsBell basePath="/patient" />
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-semibold text-white"
              aria-hidden="true"
            >
              {initials(userName)}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="focus-ring flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-red-50 hover:text-[var(--color-destructive)] disabled:opacity-50"
            >
              <LogOut size={16} aria-hidden="true" />
              <span className="hidden sm:inline">{signingOut ? "Signing out…" : "Sign out"}</span>
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
