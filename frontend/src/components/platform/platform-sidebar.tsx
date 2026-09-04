"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Ticket,
  BarChart3,
  Shield,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronDown,
  FileText,
  ClipboardList,
  User,
  Headphones,
  Megaphone,
  FlaskConical,
  Activity,
  HeartPulse,
  Lock,
  UserCog,
  Clock,
  Key,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  tenants: Building2,
  billing: CreditCard,
  coupons: Ticket,
  analytics: BarChart3,
  admins: Shield,
  settings: Settings,
  plans: FileText,
  audit: ClipboardList,
  profile: User,
  support: Headphones,
  announcements: Megaphone,
  rollouts: FlaskConical,
  saas: Activity,
  health: HeartPulse,
  rbac: Lock,
  impersonation: UserCog,
  dunning: Clock,
  apikeys: Key,
};

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export default function PlatformSidebar({
  navItems,
  userName,
  userEmail,
}: {
  navItems: NavItem[];
  userName: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  async function handleSignOut() {
    await getSupabase().auth.signOut();
    router.push("/platform/login");
  }

  function isActive(href: string) {
    if (href === "/platform") return pathname === "/platform";
    return pathname.startsWith(href);
  }

  const initials = userName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const navContent = (
    <>
      <div className="flex h-16 items-center gap-3 border-b border-[var(--color-border)] px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden shadow-sm">
          <img src="/icons/icon-192.png" alt="SkyCare" className="h-9 w-9 object-contain" />
        </div>
        <div className="min-w-0">
          <span className="block text-sm font-bold text-[var(--color-foreground)] leading-tight">
            SkyCare
          </span>
          <span className="block text-[10px] font-medium uppercase tracking-wider text-sky-600 dark:text-sky-400">
            Platform
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-3 overflow-y-auto" aria-label="Platform navigation">
        {navItems.map((item) => {
          const Icon = ICON_MAP[item.icon] || Shield;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`platform-nav-item flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                active
                  ? "active bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400 shadow-sm"
                  : "text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              }`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--color-border)] p-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setUserMenuOpen((v) => !v)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-muted-fg)] transition-all duration-200 hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-xs font-bold text-white shadow-sm">
              {initials}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium text-[var(--color-foreground)]">
                {userName}
              </p>
              <p className="truncate text-xs text-[var(--color-muted-fg)]">
                {userEmail}
              </p>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-[var(--color-muted-fg)] transition-transform duration-200 ${
                userMenuOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {userMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setUserMenuOpen(false)}
              />
              <div className="absolute bottom-full left-0 right-0 z-50 mb-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl platform-dropdown">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition-colors duration-150 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ── Mobile top bar (below md — hidden when bottom nav is present) ── */}
      <div className="sticky top-0 z-30 flex h-14 w-full items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-background)]/80 backdrop-blur px-4 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-xl p-2 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)] transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2.5">
          <img src="/icons/icon-192.png" alt="SkyCare" className="h-7 w-7 object-contain rounded-lg" />
          <span className="text-sm font-bold text-[var(--color-foreground)]">
            SkyCare Platform
          </span>
        </div>
      </div>

      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-64 flex-col bg-[var(--color-background)] shadow-2xl animate-[platform-sheet-in_0.2s_ease-out]">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 rounded-xl p-2 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)] transition-colors z-10"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
            {navContent}
          </aside>
        </div>
      )}

      {/* ── Desktop sidebar ── */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-background)] lg:flex">
        {navContent}
      </aside>
    </>
  );
}
