"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { LogOut, Menu } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { ROLE_LABELS, initials } from "@/lib/auth";
import type { StaffRole } from "@/lib/auth";

export default function Topbar({
  userName,
  role,
  onOpenSidebar,
}: {
  userName: string;
  role: StaffRole;
  onOpenSidebar: () => void;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await getSupabase().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-white/95 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="focus-ring -ml-1 rounded-lg p-2 text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-slate-100 md:hidden"
          aria-label="Open navigation"
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        <span className="font-[family-name:var(--font-heading)] text-base font-semibold sm:text-lg">
          {userName.split(/\s+/)[0] ?? "Dashboard"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-primary-dark)] sm:inline-block">
          {ROLE_LABELS[role] ?? role}
        </span>
        <Link
          href="/app/profile"
          className="focus-ring flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-semibold text-white transition-opacity duration-200 hover:opacity-90"
          aria-label="My profile"
        >
          {initials(userName)}
        </Link>
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
  );
}
