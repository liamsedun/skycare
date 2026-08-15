"use client";

import Link from "next/link";
import { useState } from "react";
import { Activity, Building2, Check, Cross, Eye, EyeOff, Globe, HeartPulse, Mail, Phone, Stethoscope, User } from "lucide-react";
import { SkyCareLogo } from "@/components/landing/skycare-logo";

function NurseIllustration() {
  return (
    <div className="animate-float-y">
      <svg viewBox="0 0 320 340" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="160" cy="170" r="130" fill="#38bdf8" opacity="0.35" className="animate-pulse-glow" />
        <circle cx="160" cy="95" r="42" fill="#fde68a" />
        <path d="M118 90 Q130 55 160 50 Q190 55 202 90 Q195 70 160 68 Q125 70 118 90" fill="#1e293b" />
        <circle cx="160" cy="55" r="16" fill="#1e293b" />
        <circle cx="145" cy="92" r="4" fill="#1e293b" />
        <circle cx="175" cy="92" r="4" fill="#1e293b" />
        <path d="M148 112 Q160 120 172 112" stroke="#1e293b" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M95 160 Q160 145 225 160 L235 290 Q160 310 85 290 Z" fill="#38bdf8" />
        <path d="M130 165 L160 195 L190 165" fill="#0284c7" />
        <path d="M125 62 Q160 40 195 62 L190 78 Q160 68 130 78 Z" fill="white" />
        <rect x="148" y="52" width="24" height="10" rx="2" fill="#ef4444" />
        <path d="M125 175 Q100 195 110 235" stroke="#0f172a" strokeWidth="3.5" fill="none" />
        <path d="M195 175 Q220 195 210 235" stroke="#0f172a" strokeWidth="3.5" fill="none" />
        <circle cx="110" cy="240" r="9" fill="#0f172a" />
        <circle cx="210" cy="240" r="9" fill="#0f172a" />
        <path d="M110 240 Q160 270 210 240" stroke="#0f172a" strokeWidth="3" fill="none" />
        <rect x="148" y="225" width="24" height="20" rx="3" fill="white" />
        <text x="160" y="239" textAnchor="middle" fontSize="10" fill="#0284c7" fontWeight="bold">RN</text>
        <path d="M95 175 Q55 210 75 255" stroke="#fde68a" strokeWidth="17" strokeLinecap="round" fill="none" />
        <path d="M225 175 Q265 210 245 255" stroke="#fde68a" strokeWidth="17" strokeLinecap="round" fill="none" />
        <g opacity="0.7">
          <circle cx="55" cy="110" r="13" fill="#7dd3fc" className="animate-pulse-glow" />
          <path d="M49 110 h12 M55 104 v12" stroke="white" strokeWidth="2.5" />
          <circle cx="265" cy="130" r="11" fill="#7dd3fc" className="animate-pulse-glow" />
          <path d="M260 130 h10 M265 125 v10" stroke="white" strokeWidth="2" />
          <circle cx="75" cy="275" r="10" fill="#7dd3fc" className="animate-pulse-glow" />
          <path d="M71 275 h8 M75 271 v8" stroke="white" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

function FloatingIcons() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <span className="animate-float-y-slow absolute left-4 top-8 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-sm">
        <Stethoscope size={20} />
      </span>
      <span className="animate-float-y absolute right-5 top-20 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-sm">
        <HeartPulse size={18} />
      </span>
      <span className="animate-float-y-slow absolute bottom-24 left-6 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-sm">
        <Cross size={18} />
      </span>
      <span className="animate-float-y absolute bottom-8 right-8 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-sm">
        <Activity size={20} />
      </span>
    </div>
  );
}

export default function SignupPage() {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <main className="animate-gradient-slow relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-sky-100 via-blue-50 to-indigo-100 px-4 py-10">
      {/* decorative floating blobs */}
      <div aria-hidden="true" className="animate-pulse-glow pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-sky-300/40 blur-3xl" />
      <div aria-hidden="true" className="animate-pulse-glow pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-blue-300/40 blur-3xl" />
      <div aria-hidden="true" className="animate-float-y-slow pointer-events-none absolute left-2/3 top-1/4 h-44 w-44 rounded-full bg-indigo-200/50 blur-2xl" />

      <div className="animate-fade-up relative flex w-full max-w-4xl overflow-hidden rounded-[28px] bg-white shadow-2xl shadow-sky-900/15">
        {/* illustration panel */}
        <div className="animate-gradient-slow relative hidden w-[340px] shrink-0 flex-col justify-center overflow-hidden bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 px-8 py-10 text-white md:flex">
          <div aria-hidden="true" className="animate-pulse-glow pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div aria-hidden="true" className="animate-pulse-glow pointer-events-none absolute -bottom-20 -left-16 h-52 w-52 rounded-full bg-sky-300/20 blur-2xl" />
          <FloatingIcons />
          <h2 className="relative text-3xl font-bold">Sign up now.</h2>
          <p className="relative mt-2 text-sm text-sky-100">
            Join the SkyCare family and get your hospital online in 5 minutes.
          </p>
          <div className="relative mt-6">
            <NurseIllustration />
          </div>
        </div>

        {/* form panel */}
        <div className="flex-1 px-6 py-10 sm:px-12">
          <div className="flex items-center justify-center">
            <SkyCareLogo size={40} />
          </div>
          <h1 className="mt-5 text-center text-xl font-bold text-slate-900">Start your free trial</h1>
          <p className="mt-1 text-center text-sm text-slate-500">
            30 days free · website & patient app included · no card required
          </p>
          <form
            className="mt-6 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const res = await fetch(
                `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/tenant-onboarding`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
                  },
                  body: JSON.stringify({
                    name: form.get("hospitalName"),
                    website: form.get("website") || undefined,
                    fullName: form.get("fullName"),
                    email: form.get("email"),
                    phone: form.get("phone") || undefined,
                    password: form.get("password"),
                  }),
                }
              );
              const data = await res.json();
              if (!res.ok) {
                alert(data.error ?? "Something went wrong. Please try again.");
                return;
              }
              window.location.href = data.subdomain ?? "/login";
            }}
          >
            <div className="relative">
              <input
                type="text"
                name="hospitalName"
                required
                placeholder="Hospital name"
                className="w-full rounded-xl border-[1.5px] border-slate-200 bg-slate-50/60 py-3 pl-4 pr-11 text-sm text-slate-800 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/10"
              />
              <Building2 size={18} aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
            <div className="relative">
              <input
                type="url"
                name="website"
                placeholder="Your website (optional) — https://yourhospital.com"
                className="w-full rounded-xl border-[1.5px] border-slate-200 bg-slate-50/60 py-3 pl-4 pr-11 text-sm text-slate-800 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/10"
              />
              <Globe size={18} aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
            <p className="-mt-2 text-xs text-slate-500">
              Your free site (e.g. liamsfields.skycare.app) is created automatically after signup.
            </p>
            <div className="relative">
              <input
                type="text"
                name="fullName"
                required
                placeholder="Your full name"
                className="w-full rounded-xl border-[1.5px] border-slate-200 bg-slate-50/60 py-3 pl-4 pr-11 text-sm text-slate-800 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/10"
              />
              <User size={18} aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
            <div className="relative">
              <input
                type="email"
                name="email"
                required
                placeholder="Work email"
                className="w-full rounded-xl border-[1.5px] border-slate-200 bg-slate-50/60 py-3 pl-4 pr-11 text-sm text-slate-800 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/10"
              />
              <Mail size={18} aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
            <div className="relative">
              <input
                type="tel"
                name="phone"
                placeholder="Phone (optional)"
                className="w-full rounded-xl border-[1.5px] border-slate-200 bg-slate-50/60 py-3 pl-4 pr-11 text-sm text-slate-800 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/10"
              />
              <Phone size={18} aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                required
                minLength={8}
                placeholder="Create password (8+ chars)"
                className="w-full rounded-xl border-[1.5px] border-slate-200 bg-slate-50/60 py-3 pl-4 pr-12 text-sm text-slate-800 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="focus-ring absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors duration-200 hover:text-slate-600"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
            <button
              type="submit"
              className="focus-ring w-full rounded-xl sky-gradient py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-sky-500/30"
            >
              Create my hospital
            </button>
          </form>
          <ul className="mt-6 space-y-1.5 border-t border-slate-100 pt-5">
            {["Hospital management system", "Free hospital website", "Free patient PWA app"].map(
              (f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-slate-500">
                  <Check size={14} className="text-emerald-500" /> {f}
                </li>
              )
            )}
          </ul>
          <p className="mt-5 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-sky-600 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
