"use client";

import Link from "next/link";
import { Suspense } from "react";
import { Activity, Cross, HeartPulse, Stethoscope } from "lucide-react";
import { SkyCareLogo } from "@/components/landing/skycare-logo";
import LoginForm from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

function DoctorIllustration() {
  return (
    <div className="animate-float-y">
      <svg viewBox="0 0 320 340" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="160" cy="170" r="130" fill="#38bdf8" opacity="0.35" className="animate-pulse-glow" />
        <circle cx="160" cy="95" r="42" fill="#fde68a" />
        <path d="M118 85 Q160 45 202 85 Q195 70 160 65 Q125 70 118 85" fill="#1e293b" />
        <circle cx="145" cy="92" r="4" fill="#1e293b" />
        <circle cx="175" cy="92" r="4" fill="#1e293b" />
        <path d="M148 112 Q160 120 172 112" stroke="#1e293b" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M95 160 Q160 145 225 160 L240 290 Q160 310 80 290 Z" fill="#ffffff" />
        <path d="M130 165 L160 210 L190 165" fill="#e0f2fe" />
        <path d="M125 175 Q100 200 105 240" stroke="#0f172a" strokeWidth="4" fill="none" />
        <path d="M195 175 Q220 200 215 240" stroke="#0f172a" strokeWidth="4" fill="none" />
        <circle cx="105" cy="245" r="10" fill="#0f172a" />
        <circle cx="215" cy="245" r="10" fill="#0f172a" />
        <path d="M105 245 Q160 280 215 245" stroke="#0f172a" strokeWidth="3.5" fill="none" />
        <rect x="148" y="230" width="24" height="24" rx="4" fill="#0284c7" />
        <rect x="157" y="234" width="6" height="16" fill="white" />
        <rect x="152" y="239" width="16" height="6" fill="white" />
        <path d="M95 175 Q60 200 70 250" stroke="#fde68a" strokeWidth="18" strokeLinecap="round" fill="none" />
        <path d="M225 175 Q260 200 250 250" stroke="#fde68a" strokeWidth="18" strokeLinecap="round" fill="none" />
        <g opacity="0.7">
          <circle cx="60" cy="100" r="14" fill="#7dd3fc" className="animate-pulse-glow" />
          <path d="M54 100 h12 M60 94 v12" stroke="white" strokeWidth="3" />
          <circle cx="260" cy="120" r="12" fill="#7dd3fc" className="animate-pulse-glow" />
          <path d="M255 120 h10 M260 115 v10" stroke="white" strokeWidth="2.5" />
          <circle cx="70" cy="280" r="10" fill="#7dd3fc" className="animate-pulse-glow" />
          <path d="M66 280 h8 M70 276 v8" stroke="white" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

function FloatingIcons() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <span className="animate-float-y-slow absolute left-4 top-8 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-sm">
        <HeartPulse size={20} />
      </span>
      <span className="animate-float-y absolute right-5 top-20 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-sm">
        <Stethoscope size={18} />
      </span>
      <span className="animate-float-y-slow absolute bottom-24 left-6 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-sm">
        <Activity size={18} />
      </span>
      <span className="animate-float-y absolute bottom-8 right-8 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-sm">
        <Cross size={20} />
      </span>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="animate-gradient-slow relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-sky-100 via-blue-50 to-indigo-100 px-4 py-10">
      {/* decorative floating blobs */}
      <div aria-hidden="true" className="animate-pulse-glow pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-sky-300/40 blur-3xl" />
      <div aria-hidden="true" className="animate-pulse-glow pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-blue-300/40 blur-3xl" />
      <div aria-hidden="true" className="animate-float-y-slow pointer-events-none absolute left-1/3 top-1/3 h-44 w-44 rounded-full bg-indigo-200/50 blur-2xl" />

      <div className="animate-fade-up relative flex w-full max-w-4xl overflow-hidden rounded-[28px] bg-white shadow-2xl shadow-sky-900/15">
        {/* illustration panel */}
        <div className="animate-gradient-slow relative hidden w-[340px] shrink-0 flex-col justify-center overflow-hidden bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 px-8 py-10 text-white md:flex">
          <div aria-hidden="true" className="animate-pulse-glow pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div aria-hidden="true" className="animate-pulse-glow pointer-events-none absolute -bottom-20 -left-16 h-52 w-52 rounded-full bg-sky-300/20 blur-2xl" />
          <FloatingIcons />
          <h2 className="relative text-3xl font-bold">Welcome back.</h2>
          <p className="relative mt-2 text-sm text-sky-100">Please enter your credentials.</p>
          <div className="relative mt-6">
            <DoctorIllustration />
          </div>
        </div>

        {/* form panel */}
        <div className="flex-1 px-6 py-10 sm:px-12">
          <div className="flex items-center justify-center">
            <SkyCareLogo size={40} />
          </div>
          <h1 className="mt-5 text-center text-xl font-bold text-slate-900">
            Sign in to your hospital
          </h1>
          <p className="mt-1 text-center text-sm text-slate-500">
            Staff portal for your hospital&apos;s day-to-day operations.
          </p>
          <Suspense>
            <LoginForm />
          </Suspense>
          <p className="mt-6 text-center text-sm text-slate-500">
            New hospital?{" "}
            <Link href="/signup" className="font-semibold text-sky-600 transition-colors duration-200 hover:underline">
              Start free trial
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}