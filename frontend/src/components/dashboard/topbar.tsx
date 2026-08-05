"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { ROLE_LABELS } from "@/lib/auth";
import type { StaffRole } from "@/lib/auth";
import NotificationsBell from "@/components/notifications-bell";
import UserMenu from "@/components/dashboard/user-menu";

export default function Topbar({
  userName,
  role,
  tenantName,
  tenantLogoUrl,
  avatarUrl,
  onOpenSidebar,
}: {
  userName: string;
  role: StaffRole;
  tenantName: string | null;
  tenantLogoUrl: string | null;
  avatarUrl: string | null;
  onOpenSidebar: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-white/95 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="focus-ring -ml-1 rounded-lg p-2 text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-slate-100 md:hidden"
          aria-label="Open navigation"
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        {tenantLogoUrl && (
          <img
            src={tenantLogoUrl}
            alt=""
            className="max-h-[68px] max-w-[68px] shrink-0 rounded-xl object-contain"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        )}
        <Link href="/app" className="truncate font-[family-name:var(--font-heading)] text-base font-semibold sm:text-lg" title={tenantName ?? undefined}>
          {tenantName ?? "SkyCare"}
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-primary-dark)] sm:inline-block">
          {ROLE_LABELS[role] ?? role}
        </span>
        <NotificationsBell basePath="/app" />
        <UserMenu userName={userName} role={role} avatarUrl={avatarUrl} />
      </div>
    </header>
  );
}