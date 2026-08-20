"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Download, LogOut, SlidersHorizontal, UserRound } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { initials } from "@/lib/auth";
import { tenantHomeUrl } from "@/lib/tenant-link";
import { mutedFg, mutedXsMt } from "@/lib/ui-constants";
import ThemeToggle from "@/components/theme-toggle";

const navigateCls =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--color-foreground)] transition-colors duration-200 hover:bg-slate-50";

export default function PatientUserMenu({
  userName,
  avatarUrl,
  tenantSlug,
}: {
  userName: string;
  avatarUrl: string | null;
  tenantSlug?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* best effort */
    }
    try {
      await getSupabase().auth.signOut();
    } catch {
      /* best effort */
    }
    if (tenantSlug) {
      // Land back on the hospital's website, not the SaaS marketing root.
      window.location.href = tenantHomeUrl(tenantSlug);
    } else {
      router.push("/login");
      router.refresh();
    }
  }, [router, tenantSlug]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="focus-ring flex items-center gap-1.5 rounded-full p-0.5 transition-opacity duration-200 hover:opacity-90"
        aria-label="Open account menu"
        aria-expanded={open}
      >
        <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--color-primary)] text-sm font-semibold text-white">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full rounded-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ) : (
            initials(userName)
          )}
        </span>
        <ChevronDown
          size={16}
          className={`hidden text-[var(--color-muted-fg)] transition-transform duration-200 sm:block ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-xl)]">
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">{userName}</p>
            <p className={mutedXsMt}>Patient</p>
          </div>

          <div className="space-y-0.5 p-2">
            <Link href="/patient/profile" onClick={() => setOpen(false)} className={navigateCls}>
              <UserRound size={16} className={mutedFg} aria-hidden="true" />
              Profile
            </Link>
            <Link href="/patient/account" onClick={() => setOpen(false)} className={navigateCls}>
              <SlidersHorizontal size={16} className={mutedFg} aria-hidden="true" />
              Account
            </Link>
            <Link href="/patient/download" onClick={() => setOpen(false)} className={navigateCls}>
              <Download size={16} className={mutedFg} aria-hidden="true" />
              Download SkyCare app
            </Link>
            <div className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span className="text-sm font-medium text-[var(--color-foreground)]">Dark mode</span>
              <ThemeToggle compact />
            </div>
          </div>

          <div className="border-t border-[var(--color-border)] p-2">
            <button type="button" onClick={signOut} disabled={signingOut} className={`${navigateCls} text-[var(--color-destructive)]`}>
              <LogOut size={16} aria-hidden="true" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}