"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import { navForRole, type NavItem, type ModuleAccess } from "@/lib/nav";
import type { StaffRole } from "@/lib/auth";
import UnreadMailBadge from "@/components/dashboard/unread-mail-badge";
import { SkyCareMark } from "@/components/landing/skycare-logo";

export default function Sidebar({
  role,
  moduleAccess,
  tenantName,
  onClose,
}: {
  role: StaffRole;
  moduleAccess?: ModuleAccess;
  tenantName: string | null;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const items = navForRole(role, moduleAccess);

  return (
    <aside className="flex h-full w-64 flex-col border-r border-[var(--color-border)] bg-white">
      <div className="flex h-16 items-center justify-between border-b border-[var(--color-border)] px-4">
        <Link href="/app" className="flex items-center gap-2" onClick={onClose}>
          <SkyCareMark size={36} rounded="rounded-xl" />
          <span className="text-lg font-bold">
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
        {items.map((item) => (
          <NavRow
            key={item.href}
            item={item}
            pathname={pathname}
            onClose={onClose}
            defaultOpen={pathname.startsWith(item.href + "/")}
          />
        ))}
      </nav>
    </aside>
  );
}

function NavRow({
  item,
  pathname,
  onClose,
  defaultOpen,
}: {
  item: NavItem;
  pathname: string;
  onClose?: () => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
  const Icon = item.icon;

  if (item.soon) {
    return (
      <div
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

  if (!item.children || item.children.length === 0) {
    return (
      <Link
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
  }

  return (
    <div>
      <div
        className={`focus-ring flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
          active
            ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]"
            : "text-[var(--color-foreground)] hover:bg-slate-50"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <Icon size={18} aria-hidden="true" />
          <span className="flex-1">{item.label}</span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`shrink-0 text-[var(--color-muted-fg)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      {open && (
        <div className="mt-1 space-y-0.5 border-l border-[var(--color-border)] pl-3 ml-5">
          {item.children.map((child) => {
            const childActive = pathname.startsWith(child.href);
            const ChildIcon = child.icon;
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onClose}
                aria-current={childActive ? "page" : undefined}
                className={`focus-ring flex items-center gap-3 rounded-lg px-3 py-1.5 text-xs transition-colors duration-200 ${
                  childActive
                    ? "bg-[var(--color-primary-soft)] font-semibold text-[var(--color-primary-dark)]"
                    : "text-[var(--color-foreground)] hover:bg-slate-50"
                }`}
              >
                <ChildIcon size={16} aria-hidden="true" className="text-[var(--color-muted-fg)]" />
                <span className="flex-1">{child.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
