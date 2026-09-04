import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PlatformSidebar from "@/components/platform/platform-sidebar";
import PlatformHeader from "@/components/platform/platform-header";
import PlatformMobileNavWrapper from "@/components/platform/platform-mobile-nav-wrapper";

export const runtime = "nodejs";

const AUTHED_NAV = [
  { href: "/platform/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/platform/tenants", label: "Tenants", icon: "tenants" },
  { href: "/platform/plans", label: "Plans", icon: "plans" },
  { href: "/platform/billing", label: "Billing", icon: "billing" },
  { href: "/platform/coupons", label: "Coupons", icon: "coupons" },
  { href: "/platform/analytics", label: "SaaS Analytics", icon: "saas" },
  { href: "/platform/admin", label: "Admins", icon: "admins" },
  { href: "/platform/support", label: "Support Tickets", icon: "support" },
  { href: "/platform/announcements", label: "Announcements", icon: "announcements" },
  { href: "/platform/rollouts", label: "Feature Rollouts", icon: "rollouts" },
  { href: "/platform/health", label: "System Health", icon: "health" },
  { href: "/platform/rbac", label: "RBAC", icon: "rbac" },
  { href: "/platform/audit", label: "Audit Log", icon: "audit" },
  { href: "/platform/impersonation", label: "Impersonation", icon: "impersonation" },
  { href: "/platform/dunning", label: "Dunning", icon: "dunning" },
  { href: "/platform/api-keys", label: "API Keys", icon: "apikeys" },
  { href: "/platform/settings", label: "Settings", icon: "settings" },
  { href: "/platform/profile", label: "Profile", icon: "profile" },
];

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return <div className="min-h-screen">{children}</div>;
  }

  let user;
  try {
    const { data } = await supabase!.auth.getUser();
    user = data.user;
  } catch {
    return <div className="min-h-screen">{children}</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen">
        {children}
      </div>
    );
  }

  const { data: userData } = await supabase!
    .from("users")
    .select("role, tenant_id, full_name, email, avatar_url")
    .eq("id", user.id)
    .single();

  if (!userData || userData.role !== "super_admin" || userData.tenant_id) {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-[var(--color-background)]">
      <PlatformSidebar
        navItems={AUTHED_NAV}
        userName={userData.full_name || userData.email || "Platform Admin"}
        userEmail={userData.email || ""}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <PlatformHeader
          userName={userData.full_name || userData.email || "Platform Admin"}
          userEmail={userData.email || ""}
          userAvatar={userData.avatar_url}
        />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 sm:py-8 md:pb-8 lg:px-8 platform-stagger">
            {children}
          </div>
        </main>
      </div>
      <PlatformMobileNavWrapper navItems={AUTHED_NAV} />
    </div>
  );
}
