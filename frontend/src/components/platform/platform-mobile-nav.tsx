"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  FileText,
  Headphones,
  CreditCard,
  Shield,
  BarChart3,
  Ticket,
  Megaphone,
  FlaskConical,
  HeartPulse,
  Lock,
  UserCog,
  Clock,
  Key,
  ClipboardList,
  Settings,
  User,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<Record<string, unknown>>> = {
  dashboard: LayoutDashboard,
  tenants: Building2,
  plans: FileText,
  billing: CreditCard,
  coupons: Ticket,
  saas: BarChart3,
  admins: Shield,
  support: Headphones,
  announcements: Megaphone,
  rollouts: FlaskConical,
  health: HeartPulse,
  rbac: Lock,
  audit: ClipboardList,
  impersonation: UserCog,
  dunning: Clock,
  apikeys: Key,
  settings: Settings,
  profile: User,
};

const FOOTER_COLORS: Record<string, string> = {
  dashboard: "#60a5fa",
  tenants: "#34d399",
  plans: "#a78bfa",
  billing: "#fbbf24",
  support: "#f472b6",
};

const TILE_COLORS: Record<string, string> = {
  coupons: "#fcd34d",
  saas: "#818cf8",
  admins: "#34d399",
  announcements: "#f9a8d4",
  rollouts: "#67e8f9",
  health: "#fca5a5",
  rbac: "#c4b5fd",
  audit: "#fdba74",
  impersonation: "#a5b4fc",
  dunning: "#fda4af",
  apikeys: "#86efac",
  settings: "#94a3b8",
  profile: "#fde047",
};

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const TAB_KEYS = ["dashboard", "tenants", "plans", "billing", "support"];

export default function PlatformMobileNav({ navItems }: { navItems: NavItem[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/platform") return pathname === "/platform";
    return pathname.startsWith(href);
  }

  const tabs = TAB_KEYS.map((key) => navItems.find((n) => n.icon === key)).filter(Boolean) as NavItem[];
  const menuItems = navItems.filter((n) => !TAB_KEYS.includes(n.icon));

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const handleNav = useCallback(
    (href: string) => {
      closeMenu();
      router.push(href);
    },
    [closeMenu, router]
  );

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 md:hidden">
      {/* ── Dimming overlay ── */}
      <div
        aria-hidden="true"
        onClick={() => { setMenuOpen(false); }}
        className={`absolute inset-0 -top-[100vh] bg-black/55 backdrop-blur-[2px] transition-opacity duration-200 ${
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* ── More sheet ── */}
      <div
        id="platform-more-sheet"
        role="dialog"
        aria-label="More menu"
        className={`absolute bottom-[84px] right-3 flex max-h-[min(560px,calc(100vh-76px))] w-[calc(100vw-24px)] max-w-[350px] origin-bottom-right flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] shadow-[0_-6px_40px_rgba(0,0,0,0.25),0_24px_60px_rgba(0,0,0,0.35)] transition-all duration-200 ${
          menuOpen ? "scale-100 opacity-100" : "pointer-events-none scale-[0.92] opacity-0"
        }`}
      >
        <span className="absolute -bottom-1.5 right-[38px] h-4 w-4 rotate-45 rounded-[2px] border-r border-b border-[var(--color-border)] bg-[var(--color-background)]" />
        <div className="flex shrink-0 items-center justify-between px-1.5 pb-2.5 pt-1">
          <span className="text-[13px] font-semibold tracking-wide text-[var(--color-foreground)]">More</span>
          <span className="text-[10px] text-[var(--color-muted-fg)]">tap a tile to open</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
          <div className="grid grid-cols-3 gap-y-1 gap-x-2">
            {menuItems.map((item, idx) => {
              const Icon = ICON_MAP[item.icon] || Shield;
              const color = TILE_COLORS[item.icon] || "#94a3b8";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => { setMenuOpen(false); }}
                  style={{ animationDelay: `${idx * 35}ms` }}
                  className="group flex w-full flex-col items-center gap-1 rounded-xl px-1 pb-1.5 pt-1.5 transition-colors duration-150 active:bg-white/10 animate-tile-in"
                >
                  <span
                    className="grid h-11 w-11 place-items-center rounded-[16px] text-[#1b2430] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_3px_8px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:-translate-y-1 group-hover:scale-110 group-active:scale-95"
                    style={{ backgroundColor: color }}
                  >
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <span className="text-center text-[10px] leading-tight text-[var(--color-foreground)] transition-colors duration-200 group-hover:text-[var(--color-primary-dark)]">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Bottom bar — frosted glass floating dock ── */}
      <nav
        aria-label="Platform navigation"
        className="platform-mobile-nav relative z-10 mx-3 mb-0 flex items-end gap-1 rounded-b-none rounded-t-[1.5rem] border border-[var(--color-border)] bg-[var(--color-background)]/85 px-3 pt-0.5 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.08),0_12px_34px_rgba(0,0,0,0.18)] backdrop-blur-xl"
      >
        <div className="flex min-w-0 flex-1">
          {tabs.map((item, i) => {
            const Icon = ICON_MAP[item.icon] || Shield;
            const active = isActive(item.href);
            const color = FOOTER_COLORS[item.icon] || "#60a5fa";
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                style={{ animationDelay: `${i * 60}ms` }}
                className={`group flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5 rounded-xl px-1 pb-0 pt-0.5 transition-colors duration-200 active:scale-[0.93] animate-nav-item ${
                  active ? "text-[var(--color-primary)]" : "text-[var(--color-muted-fg)] hover:text-[var(--color-primary)]"
                }`}
              >
                <span className="relative grid h-9 w-full place-items-center">
                  {active && (
                    <>
                      <span
                        aria-hidden="true"
                        className="mobile-tab-capsule absolute inset-0 m-auto h-9 w-9 overflow-hidden rounded-[12px] bg-[var(--color-primary)]/15 ring-1 ring-[var(--color-primary)]/30 animate-tab-capsule"
                      >
                        <span
                          aria-hidden="true"
                          className="mobile-tab-shine absolute inset-0 bg-gradient-to-b from-white/30 to-transparent"
                        />
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 w-9 bg-gradient-to-r from-transparent via-[var(--color-primary)]/30 to-transparent animate-tab-shine"
                        />
                      </span>
                      <span
                        aria-hidden="true"
                        className="mobile-tab-glow absolute inset-0 m-auto h-7 w-7 rounded-full bg-[var(--color-primary)]/25 blur-[5px] animate-tab-glow-pulse"
                      />
                    </>
                  )}
                  <Icon
                    size={22}
                    strokeWidth={active ? 1.6 : 1.4}
                    aria-hidden="true"
                    data-key={item.icon}
                    style={{ color }}
                    className={`mobile-nav-icon relative z-10 transition-transform duration-300 ${
                      active
                        ? "animate-tab-icon-spring drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
                        : "opacity-80 group-hover:-translate-y-0.5 group-hover:scale-110 group-hover:opacity-100"
                    }`}
                  />
                </span>
                <span
                  aria-hidden="true"
                  className={`mobile-tab-dot h-1 rounded-full transition-all duration-300 ${
                    active
                      ? "w-4 bg-[var(--color-primary)] animate-tab-dot shadow-[0_0_10px_var(--color-primary)]"
                      : "w-1 bg-transparent group-hover:bg-[var(--color-primary)]/40"
                  }`}
                />
              </Link>
            );
          })}
        </div>

        {/* ── Floating More FAB ── */}
        <div className="relative flex w-[76px] flex-none items-end justify-center">
          <button
            type="button"
            aria-label={menuOpen ? "Close More menu" : "Open More menu"}
            aria-expanded={menuOpen}
            aria-controls="platform-more-sheet"
            onClick={() => { setMenuOpen((v) => !v); }}
            className={`relative grid h-14 w-14 -translate-y-[18px] place-items-center rounded-full bg-[linear-gradient(145deg,#f6bd4a,#d98d15)] text-[#191304] shadow-[0_12px_30px_rgba(240,169,58,0.45),0_4px_10px_rgba(0,0,0,0.4)] transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-90 ${
              menuOpen ? "-rotate-180" : "hover:-translate-y-[22px] hover:shadow-[0_16px_36px_rgba(240,169,58,0.55),0_4px_10px_rgba(0,0,0,0.4)]"
            }`}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-1.5 animate-fab-halo"
              style={{
                background:
                  "conic-gradient(from 0deg, rgba(255,205,110,0.65), rgba(240,169,58,0.15) 60deg, transparent 180deg, rgba(255,205,110,0.65) 320deg, rgba(255,205,110,0.65) 360deg)",
                borderRadius: "9999px",
                WebkitMaskImage: "radial-gradient(circle, black 30%, transparent 70%)",
                maskImage: "radial-gradient(circle, black 30%, transparent 70%)",
              }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-3 rounded-full bg-[#f0a93a]/25 blur-xl animate-pulse-glow"
            />
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 rounded-full border-2 border-[#f5b840]/60 animate-fab-ring transition-opacity duration-300 ${
                menuOpen ? "opacity-0" : "opacity-100"
              }`}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
            >
              <span className="absolute inset-y-0 w-1/3 bg-white/25 blur-[3px] animate-fab-sheen" />
            </span>
            <span
              className={`absolute grid place-items-center transition-all duration-200 ${
                menuOpen ? "scale-50 opacity-0" : "scale-100 opacity-100"
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
                <circle cx="4.5" cy="4.5" r="1.8" />
                <circle cx="9" cy="4.5" r="1.8" />
                <circle cx="13.5" cy="4.5" r="1.8" />
                <circle cx="4.5" cy="9" r="1.8" />
                <circle cx="9" cy="9" r="1.8" />
                <circle cx="13.5" cy="9" r="1.8" />
                <circle cx="4.5" cy="13.5" r="1.8" />
                <circle cx="9" cy="13.5" r="1.8" />
                <circle cx="13.5" cy="13.5" r="1.8" />
              </svg>
            </span>
            <span
              className={`absolute grid place-items-center transition-all duration-200 ${
                menuOpen ? "scale-100 opacity-100" : "scale-50 opacity-0"
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="4" x2="14" y2="14" />
                <line x1="14" y1="4" x2="4" y2="14" />
              </svg>
            </span>
          </button>
          <span className="mb-1 text-[10px] font-medium text-[var(--color-muted-fg)]">More</span>
        </div>
      </nav>
    </div>
  );
}
