"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Download, UserCog, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { navForRole, type NavItem, type ModuleAccess } from "@/lib/nav";
import type { StaffRole } from "@/lib/auth";
import { PATIENT_NAV_ITEMS } from "@/lib/patient-nav";
import UnreadMailBadge from "@/components/dashboard/unread-mail-badge";

/**
 * Mobile bottom navigation (renders only below md breakpoint).
 * Six flat tabs plus a floating "More" FAB on the right that opens a
 * 3-column grid of the remaining modules. The staff version is fed by
 * navForRole() so role gates and per-user module_access grants apply
 * exactly like the sidebar; the patient version is fed by PATIENT_NAV_ITEMS.
 */

export interface MobileNavTile {
  key: string;
  label?: string;
  href?: string;
  icon: LucideIcon;
  children?: { href: string; label: string; icon: LucideIcon }[];
}

export interface MobileNavSpec {
  root: string;
  tabs: MobileNavTile[];
  menu: MobileNavTile[];
  mailHref?: string;
}

const TILE_COLORS: Record<string, string> = {
  wards: "#bae6fd",
  "other-income": "#a7f3d0",
  staff: "#fcd34d",
  hr: "#ddd6fe",
  payroll: "#fecdd3",
  leave: "#a5f3fc",
  roster: "#d9f99d",
  mail: "#fed7aa",
  chats: "#f5d0fe",
  reports: "#c7d2fe",
  "financial-reports": "#99f6e4",
  "audit-logs": "#e2e8f0",
  account: "#fde68a",
  subscription: "#bfdbfe",
  download: "#e9d5ff",
  profile: "#fbcfe8",
  settings: "#fca5a5",
  overview: "#bfdbfe",
  patients: "#a7f3d0",
  appointments: "#ddd6fe",
  pharmacy: "#fcd34d",
  lab: "#bae6fd",
  billing: "#99f6e4",
  prescriptions: "#fecdd3",
  "lab-results": "#bae6fd",
  records: "#c7d2fe",
  family: "#a5f3fc",
  notifications: "#e2e8f0",
  "internal-mail": "#fed7aa",
};

const FOOTER_COLORS: Record<string, string> = {
  overview: "#60a5fa",
  patients: "#34d399",
  appointments: "#a78bfa",
  pharmacy: "#fbbf24",
  lab: "#22d3ee",
  "lab-results": "#22d3ee",
  billing: "#2dd4bf",
  chats: "#f472b6",
  "internal-mail": "#fb923c",
  mail: "#fb923c",
  prescriptions: "#fb7185",
  records: "#818cf8",
  family: "#22d3ee",
  notifications: "#94a3b8",
  account: "#facc15",
  download: "#c084fc",
  profile: "#f472b6",
};

export function MobileNavBar({ spec }: { spec: MobileNavSpec }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    setOpen(false);
    setOpenKey(null);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setOpenKey(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) =>
    href === spec.root ? pathname === spec.root : pathname.startsWith(href);

  const tabs = spec.tabs.filter((t) => Boolean(t.href));

  const groupTiles = (item: MobileNavTile) =>
    item.children && item.children.length > 0 ? item.children : null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 md:hidden">
      {/* dimming overlay behind the sheet */}
      <div
        aria-hidden="true"
        onClick={() => {
          setOpen(false);
          setOpenKey(null);
        }}
        className={`absolute inset-0 -top-[100vh] bg-black/55 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* More sheet */}
      <div
        id="mobile-more-sheet"
        role="dialog"
        aria-label="More menu"
        className={`absolute bottom-[84px] right-3 flex max-h-[min(560px,calc(100vh-76px))] w-[calc(100vw-24px)] max-w-[350px] origin-bottom-right flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] shadow-[0_-6px_40px_rgba(0,0,0,0.25),0_24px_60px_rgba(0,0,0,0.35)] transition-all duration-200 ${
          open ? "scale-100 opacity-100" : "pointer-events-none scale-[0.92] opacity-0"
        }`}
      >
        <span className="absolute -bottom-1.5 right-[38px] h-4 w-4 rotate-45 rounded-[2px] border-r border-b border-[var(--color-border)] bg-[var(--color-background)]" />
        <div className="flex shrink-0 items-center justify-between px-1.5 pb-2.5 pt-1">
          <span className="text-[13px] font-semibold tracking-wide text-[var(--color-foreground)]">More</span>
          <span className="text-[10px] text-[var(--color-muted-fg)]">tap a tile to open</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5 [scrollbar-width:thin] [scrollbar-color:#2c3849_transparent]">
          <div className="grid grid-cols-3 gap-y-1 gap-x-2">
            {spec.menu.map((item, idx) => {
              const Icon = item.icon;
              const children = groupTiles(item);
              const expanding = openKey === item.key;
              return (
                <div key={item.key} className="flex flex-col items-center">
                  {children ? (
                    <button
                      type="button"
                      onClick={() => setOpenKey(expanding ? null : item.key)}
                      aria-expanded={expanding}
                      style={{ animationDelay: `${idx * 35}ms` }}
                      className={`group flex w-full flex-col items-center gap-1 rounded-xl px-1 pb-1.5 pt-1.5 transition-colors duration-150 active:bg-white/10 animate-tile-in ${
                        expanding ? "bg-[var(--color-primary-soft)]/60" : ""
                      }`}
                    >
                      <span
                        className="relative grid h-11 w-11 place-items-center rounded-[16px] text-[#1b2430] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_3px_8px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:-translate-y-1 group-hover:scale-110 group-active:scale-95"
                        style={{ backgroundColor: TILE_COLORS[item.key] ?? "#e2e8f0" }}
                      >
                        <Icon size={22} aria-hidden="true" />
                        <span className="absolute -right-1 -top-1 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-[#f0a93a] px-1 text-[9px] font-bold text-[#191304] shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
                          {children.length}
                        </span>
                      </span>
                      <span className="text-center text-[10px] leading-tight text-[var(--color-foreground)] transition-colors duration-200 group-hover:text-[var(--color-primary-dark)]">{item.label}</span>
                    </button>
                  ) : (
                    <Link
                      href={item.href!}
                      onClick={() => {
                        setOpen(false);
                        setOpenKey(null);
                      }}
                      style={{ animationDelay: `${idx * 35}ms` }}
                      className="group flex w-full flex-col items-center gap-1 rounded-xl px-1 pb-1.5 pt-1.5 transition-colors duration-150 active:bg-white/10 animate-tile-in"
                    >
                      <span
                        className="grid h-11 w-11 place-items-center rounded-[16px] text-[#1b2430] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_3px_8px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:-translate-y-1 group-hover:scale-110 group-active:scale-95"
                        style={{ backgroundColor: TILE_COLORS[item.key] ?? "#e2e8f0" }}
                      >
                        <Icon size={22} aria-hidden="true" />
                      </span>
                      <span className="text-center text-[10px] leading-tight text-[var(--color-foreground)] transition-colors duration-200 group-hover:text-[var(--color-primary-dark)]">{item.label}</span>
                      {spec.mailHref && item.href === spec.mailHref && (
                        <span className="-mt-1">
                          <UnreadMailBadge />
                        </span>
                      )}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>

          {/* group children chips */}
          {spec.menu.some((m) => m.children && m.children.length > 0) && (
            <div
              className={`grid transition-all duration-200 ${
                openKey ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                {(() => {
                  const active = spec.menu.find((m) => m.key === openKey);
                  if (!active?.children) return null;
                  return (
                    <div className="flex flex-wrap gap-1.5 px-1 pt-2.5 pb-1">
                      {active.children.map((c, ci) => {
                        const ChildIcon = c.icon;
                        return (
                          <Link
                            key={c.href}
                            href={c.href}
                            onClick={() => {
                              setOpen(false);
                              setOpenKey(null);
                            }}
                            style={{ animationDelay: `${ci * 45}ms` }}
                            className={`flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-2.5 py-1.5 text-[11px] text-[var(--color-foreground)] transition-colors duration-150 active:bg-[var(--color-primary-soft)] animate-chip-in ${
                              isActive(c.href) ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]" : ""
                            }`}
                          >
                            <ChildIcon size={13} aria-hidden="true" />
                            {c.label}
                          </Link>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* bar — frosted glass floating dock */}
      <nav
        aria-label="Mobile navigation"
        className="mobile-nav-bar relative z-10 mx-3 mb-0 flex items-end gap-1 rounded-b-none rounded-t-[1.5rem] border border-[var(--color-border)] bg-[var(--color-background)]/85 px-3 pt-0.5 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.08),0_12px_34px_rgba(0,0,0,0.18)] backdrop-blur-xl"
      >
        <div className="flex min-w-0 flex-1">
          {tabs.map((item, i) => {
            const Icon = item.icon;
            const active = isActive(item.href!);
            return (
              <Link
                key={item.key}
                href={item.href!}
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
                    data-key={item.key}
                    style={{ color: FOOTER_COLORS[item.key] ?? "var(--color-primary)" }}
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

        {/* floating More button */}
        <div className="relative flex w-[76px] flex-none items-end justify-center">
          <button
            type="button"
            aria-label={open ? "Close More menu" : "Open More menu"}
            aria-expanded={open}
            aria-controls="mobile-more-sheet"
            onClick={() => {
              setOpen((o) => !o);
              setOpenKey(null);
            }}
            className={`relative grid h-14 w-14 -translate-y-[18px] place-items-center rounded-full bg-[linear-gradient(145deg,#f6bd4a,#d98d15)] text-[#191304] shadow-[0_12px_30px_rgba(240,169,58,0.45),0_4px_10px_rgba(0,0,0,0.4)] transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-90 ${
              open ? "-rotate-180" : "hover:-translate-y-[22px] hover:shadow-[0_16px_36px_rgba(240,169,58,0.55),0_4px_10px_rgba(0,0,0,0.4)]"
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
                open ? "opacity-0" : "opacity-100"
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
                open ? "scale-50 opacity-0" : "scale-100 opacity-100"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
                <circle cx="4.5" cy="4.5" r="1.8" />
                <circle cx="12" cy="4.5" r="1.8" />
                <circle cx="19.5" cy="4.5" r="1.8" />
                <circle cx="4.5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19.5" cy="12" r="1.8" />
                <circle cx="4.5" cy="19.5" r="1.8" />
                <circle cx="12" cy="19.5" r="1.8" />
                <circle cx="19.5" cy="19.5" r="1.8" />
              </svg>
            </span>
            <span
              className={`absolute grid place-items-center transition-all duration-200 ${
                open ? "scale-100 opacity-100" : "scale-50 opacity-0"
              }`}
            >
              <X size={24} aria-hidden="true" />
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Staff spec: fed by navForRole (role gates + module_access grants).  */
/* ------------------------------------------------------------------ */

const TAB_KEYS = ["overview", "patients", "appointments", "pharmacy", "billing"] as const;

const MENU_SPEC: { key: string; label?: string }[] = [
  { key: "lab" },
  { key: "wards", label: "Ward" },
  { key: "other-income" },
  { key: "staff" },
  { key: "hr", label: "Human Resources" },
  { key: "payroll" },
  { key: "leave" },
  { key: "roster", label: "Roster" },
  { key: "mail" },
  { key: "chats", label: "Chat" },
  { key: "reports" },
  { key: "financial-reports" },
  { key: "audit-logs" },
  { key: "account", label: "Accounts" },
  { key: "subscription" },
  { key: "download" },
  { key: "profile" },
  { key: "settings" },
];

export default function MobileNav({
  role,
  moduleAccess,
}: {
  role: StaffRole;
  moduleAccess?: ModuleAccess;
}) {
  const items = useMemo(() => navForRole(role, moduleAccess), [role, moduleAccess]);

  const index = useMemo(() => {
    const top = new Map<string, NavItem>();
    const kids = new Map<string, NavItem>();
    for (const item of items) {
      top.set(item.key, item);
      for (const child of item.children ?? []) kids.set(child.key, child);
    }
    return { top, kids };
  }, [items]);

  const tabs = TAB_KEYS.map((k) => index.top.get(k)).filter((t): t is NavItem => Boolean(t));

  const rosterChild = index.kids.get("hr-roster");
  const menu: NavItem[] = MENU_SPEC.map((spec) => {
    if (spec.key === "roster") return rosterChild ? { ...rosterChild, label: "Roster" } : null;
    const item = index.top.get(spec.key) ?? null;
    if (item && spec.label) return { ...item, label: spec.label };
    return item;
  }).filter((t): t is NavItem => Boolean(t));

  const spec: MobileNavSpec = { root: "/app", tabs, menu, mailHref: "/app/mail" };
  return <MobileNavBar spec={spec} />;
}

/* ------------------------------------------------------------------ */
/* Patient spec: fed by PATIENT_NAV_ITEMS + account/download pages.    */
/* ------------------------------------------------------------------ */

const PATIENT_TAB_KEYS = ["overview", "appointments", "billing", "chats", "internal-mail"] as const;

const PATIENT_MENU: { key: string; label?: string; href?: string; icon?: LucideIcon }[] = [
  { key: "lab-results" },
  { key: "prescriptions" },
  { key: "records", label: "Medical Records" },
  { key: "family" },
  { key: "notifications" },
  { key: "profile" },
  { key: "account", label: "Account", href: "/patient/account", icon: UserCog },
  { key: "download", label: "Download App", href: "/patient/download", icon: Download },
];

export function PatientMobileNav() {
  const index = useMemo(() => {
    const map = new Map<string, MobileNavTile>();
    for (const item of PATIENT_NAV_ITEMS) {
      const key = item.href.replace("/patient", "").replace(/^\//, "") || "overview";
      map.set(key, { key, label: item.label, href: item.href, icon: item.icon });
    }
    return map;
  }, []);

  const tabs = PATIENT_TAB_KEYS.map((k) => index.get(k)).filter(
    (t): t is MobileNavTile => Boolean(t),
  );

  const menu: MobileNavTile[] = PATIENT_MENU.flatMap((spec) => {
    const base = index.get(spec.key);
    if (!base) {
      if (spec.href && spec.icon) {
        return [
          {
            key: spec.key,
            label: spec.label ?? spec.key,
            href: spec.href,
            icon: spec.icon,
          },
        ];
      }
      return [];
    }
    return [
      {
        ...base,
        label: spec.label ?? base.label,
        href: spec.href ?? base.href,
        icon: spec.icon ?? base.icon,
      },
    ];
  });

  const spec: MobileNavSpec = { root: "/patient", tabs, menu, mailHref: "/patient/internal-mail" };
  return <MobileNavBar spec={spec} />;
}
