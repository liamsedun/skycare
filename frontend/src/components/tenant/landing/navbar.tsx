"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { LogIn, Menu, X } from "lucide-react";
import { TenantLogo } from "./logo";
import type { TenantSiteProfile } from "@/lib/tenant-site";

export default function TenantNavbar({ tenant }: { tenant: TenantSiteProfile }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const home = `/${tenant.slug}`;
  const navLinks = [
    { label: "Home", href: `${home}#home` },
    { label: "About", href: `${home}/about` },
    { label: "Services", href: `${home}#services` },
    { label: "Doctors", href: `${home}/doctors` },
    { label: "Contact", href: `${home}#contact` },
  ];

  return (
    <header
      className={
        "fixed inset-x-0 top-0 z-50 transition-all duration-300 " +
        (scrolled
          ? "bg-white/95 shadow-[0_2px_16px_rgba(15,76,129,0.08)] backdrop-blur-md"
          : "bg-transparent")
      }
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:h-20">
        <a href={`${home}#home`} className="flex items-center gap-2.5">
          <TenantLogo
            tenant={tenant}
            scrolled={scrolled}
            hideSubtitle={false}
          />
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={
                "text-sm font-medium transition-colors hover:text-[#0F4C81] " +
                (scrolled ? "text-[#6B7A90]" : "text-white/85 hover:text-white")
              }
            >
              {link.label}
            </a>
          ))}
          <a
            href={`${home}/login`}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F4C81] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0B3A63] active:scale-[0.97]"
          >
            <LogIn size={16} />
            Patient Login
          </a>
        </nav>

        <button
          onClick={() => setOpen(!open)}
          className={
            "md:hidden p-2 rounded-lg transition-colors " +
            (scrolled ? "text-[#6B7A90] hover:bg-[#F1F4F9]" : "text-white hover:bg-white/10")
          }
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <div
        className={
          "md:hidden overflow-hidden transition-all duration-300 " +
          (open ? "max-h-80" : "max-h-0")
        }
      >
        <nav className="flex flex-col gap-1 bg-white px-5 pb-5 pt-2 shadow-lg">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-4 py-3 text-sm font-medium text-[#6B7A90] transition-colors hover:bg-[#F1F4F9] hover:text-[#0F4C81]"
            >
              {link.label}
            </a>
          ))}
          <Link
            href={`${home}/login`}
            onClick={() => setOpen(false)}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-[#0F4C81] px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-[#0B3A63]"
          >
            <LogIn size={16} />
            Patient Login
          </Link>
        </nav>
      </div>
    </header>
  );
}