"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { navForRole } from "@/lib/nav";
import type { StaffRole } from "@/lib/auth";
import UnreadMailBadge from "@/components/dashboard/unread-mail-badge";
import { SkyCareMark } from "@/components/landing/skycare-logo";

export default function Sidebar({
  role,
  tenantName,
  onClose,
}: {
  role: StaffRole;
  tenantName: string | null;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const items = navForRole(role);

  return (
    <aside className="flex h-full w-64 flex-col border-r border-[var(--color-border)] bg-white">
      <div className="flex h-16 items-center justify-between border-b border-[var(--color-border)] px-4">
        <Link href="/app" className="flex items-center gap-2" onClick={onClose}>
          <SkyCareMark size={36} rounded="rounded-xl" />
          <span className="font-[family-name:var(--font-heading)] text-lg font-bold">
            <span className="text-slate-900">Sky</span><span className="text-sky-600">Care</span>
          </span>
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="focus-ring -mr-1 rounded-lg p-2 text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-slate-100 hover:text-[var(--color-foreground)] md:hidden"
            aria-label="Close navigation"
          >
            <X size={20} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
          Hospital
        </p>
        <p className="mt-0.5 truncate text-sm font-medium" title={tenantName ?? undefined}>
          {tenantName ?? "Platform"}
        </p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {items.map((item) => {
          const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
          const Icon = item.icon;
          if (item.soon) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--color-muted-fg)]"
                aria-disabled="true"
              >
                <Icon size={18} aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
                <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  Soon
                </span>
              </div>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              aria-current={active ? "page" : undefined}
              className={`focus-ring flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                active
                  ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]"
                  : "text-[var(--color-foreground)] hover:bg-slate-50"
              }`}
            >
              <Icon size={18} aria-hidden="true" />
              <span className="flex-1">{item.label}</span>
              {item.href === "/app/mail" && <UnreadMailBadge />}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
