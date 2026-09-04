"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  Building2,
  BarChart3,
  CreditCard,
  Users,
  ArrowRight,
  Sparkles,
  Lock,
  Globe,
} from "lucide-react";

const FEATURES = [
  {
    icon: Building2,
    title: "Multi-Tenant Management",
    desc: "Onboard and manage unlimited hospitals from a single control plane.",
  },
  {
    icon: BarChart3,
    title: "Real-Time Analytics",
    desc: "Track revenue, trial conversions, and hospital performance at a glance.",
  },
  {
    icon: CreditCard,
    title: "Subscription Billing",
    desc: "Plans, coupons, invoices — full lifecycle subscription management.",
  },
  {
    icon: Users,
    title: "Platform Administration",
    desc: "Create admin accounts, manage roles, and control platform access.",
  },
  {
    icon: Lock,
    title: "Enterprise Security",
    desc: "Row-level security, audit logging, and role-based access control.",
  },
  {
    icon: Globe,
    title: "White-Label Ready",
    desc: "Every hospital gets its own branded subdomain and custom website.",
  },
];

function FloatingOrb({
  size,
  x,
  y,
  delay,
  duration,
}: {
  size: number;
  x: string;
  y: string;
  delay: number;
  duration: number;
}) {
  return (
    <div
      className="pointer-events-none absolute rounded-full opacity-20 blur-3xl"
      style={{
        width: size,
        height: size,
        left: x,
        top: y,
        background: "radial-gradient(circle, #e0a84a 0%, transparent 70%)",
        animation: `platform-orb-float ${duration}s ease-in-out ${delay}s infinite alternate`,
      }}
    />
  );
}

export default function PlatformLandingPage() {
  const [mounted, setMounted] = useState(false);
  const [visibleSections, setVisibleSections] = useState<Set<number>>(new Set());
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const idx = Number(entry.target.getAttribute("data-idx"));
          if (entry.isIntersecting) {
            setVisibleSections((prev) => new Set([...prev, idx]));
          }
        });
      },
      { threshold: 0.15 }
    );

    sectionRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [mounted]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0c1420]">
      {/* Floating orbs */}
      <FloatingOrb size={400} x="-5%" y="10%" delay={0} duration={8} />
      <FloatingOrb size={300} x="70%" y="5%" delay={2} duration={10} />
      <FloatingOrb size={250} x="80%" y="60%" delay={4} duration={7} />
      <FloatingOrb size={200} x="15%" y="70%" delay={1} duration={9} />

      {/* Grid pattern overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(224,168,74,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(224,168,74,0.5) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#e0a84a]/30 bg-[#e0a84a]/10 overflow-hidden">
            <img src="/icons/icon-192.png" alt="SkyCare" className="h-8 w-8 object-contain" />
          </div>
          <div>
            <span className="text-lg font-bold text-white">SkyCare</span>
            <span className="ml-1.5 text-xs font-medium text-[#e0a84a]">Platform</span>
          </div>
        </div>
        <Link
          href="/platform/login"
          className="group flex items-center gap-2 rounded-lg border border-[#e0a84a]/30 bg-[#e0a84a]/10 px-4 py-2 text-sm font-semibold text-[#e0a84a] transition-all duration-300 hover:border-[#e0a84a]/60 hover:bg-[#e0a84a]/20 hover:shadow-lg hover:shadow-[#e0a84a]/10"
        >
          Sign In
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
      </nav>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pt-20 pb-28 text-center sm:pt-28 sm:pb-36">
        {/* Glow ring behind heading */}
        <div className="pointer-events-none absolute left-1/2 top-20 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-[#e0a84a]/8 blur-3xl" />

        <div
          className="inline-flex items-center gap-2 rounded-full border border-[#e0a84a]/20 bg-[#e0a84a]/5 px-4 py-1.5 text-xs font-medium text-[#e0a84a] backdrop-blur-sm"
          style={{
            animation: mounted ? "platform-fade-slide-up 0.6s ease-out both" : "none",
          }}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Skyhouse / SkyCare Staff Only
        </div>

        <h1
          className="mt-8 text-4xl font-bold tracking-tight text-white sm:text-6xl"
          style={{
            animation: mounted ? "platform-fade-slide-up 0.7s ease-out 0.1s both, platform-text-glow 4s ease-in-out 1s infinite" : "none",
          }}
        >
          The Command Center for{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: "linear-gradient(135deg, #ffd98a, #e0a84a, #c4882a)",
            }}
          >
            SkyCare SaaS
          </span>
        </h1>

        <p
          className="mx-auto mt-6 max-w-2xl text-lg text-[#8fa0b3]"
          style={{
            animation: mounted ? "platform-fade-slide-up 0.7s ease-out 0.2s both" : "none",
          }}
        >
          Manage every hospital tenant, track subscriptions, monitor revenue, and
          configure the platform — all from one dashboard built for the team
          that powers SkyCare.
        </p>

        <div
          className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          style={{
            animation: mounted ? "platform-fade-slide-up 0.7s ease-out 0.3s both" : "none",
          }}
        >
          <Link
            href="/platform/login"
            className="group relative flex items-center gap-2 overflow-hidden rounded-xl px-8 py-3.5 text-sm font-bold text-[#24160a] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl"
            style={{
              background: "linear-gradient(180deg, #ffd98a, #e0a84a)",
              boxShadow: "0 0 25px rgba(224,168,74,0.25)",
            }}
          >
            <span className="relative z-10">Access Platform</span>
            <ArrowRight className="relative z-10 h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            <div
              className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              style={{
                background: "linear-gradient(180deg, #ffecc0, #ffd98a)",
              }}
            />
          </Link>
          <span className="text-xs text-[#566173]">
            Authorized personnel only
          </span>
        </div>
      </section>

      {/* Features grid */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-28">
        <div
          ref={(el) => { sectionRefs.current[0] = el; }}
          data-idx={0}
          className="text-center"
          style={{
            opacity: visibleSections.has(0) ? 1 : 0,
            transform: visibleSections.has(0) ? "none" : "translateY(30px)",
            transition: "all 0.6s ease-out",
          }}
        >
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Everything You Need to Run the Platform
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[#8fa0b3]">
            Full control over every hospital on SkyCare — from onboarding to
            analytics.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                ref={(el) => { sectionRefs.current[i + 1] = el; }}
                data-idx={i + 1}
                className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7 backdrop-blur-sm transition-all duration-500 hover:border-[#e0a84a]/20 hover:bg-[#e0a84a]/[0.03] hover:shadow-lg hover:shadow-[#e0a84a]/5"
                style={{
                  opacity: visibleSections.has(i + 1) ? 1 : 0,
                  transform: visibleSections.has(i + 1) ? "none" : "translateY(30px)",
                  transition: `all 0.5s ease-out ${i * 0.08}s`,
                }}
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-[#e0a84a]/15 bg-[#e0a84a]/10 transition-colors duration-300 group-hover:border-[#e0a84a]/30 group-hover:bg-[#e0a84a]/15">
                  <Icon className="h-5 w-5 text-[#e0a84a]" />
                </div>
                <h3 className="text-base font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#8fa0b3]">
                  {f.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="relative z-10 border-t border-white/[0.05] bg-white/[0.01]">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Ready to Manage Your Platform?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[#8fa0b3]">
            Sign in with your authorized credentials to access the SkyCare
            Platform dashboard.
          </p>
          <Link
            href="/platform/login"
            className="mt-8 inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm font-bold text-[#24160a] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl"
            style={{
              background: "linear-gradient(180deg, #ffd98a, #e0a84a)",
              boxShadow: "0 0 20px rgba(224,168,74,0.2)",
            }}
          >
            Sign In to Platform
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-6 text-xs text-[#566173]">
            SkyCare Platform &copy; {new Date().getFullYear()} &mdash; SkyHouse Operations
          </p>
        </div>
      </section>
    </div>
  );
}
