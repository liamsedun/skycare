"use client";

import PlatformMobileNav from "@/components/platform/platform-mobile-nav";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export default function PlatformMobileNavWrapper({ navItems }: { navItems: NavItem[] }) {
  return <PlatformMobileNav navItems={navItems} />;
}
