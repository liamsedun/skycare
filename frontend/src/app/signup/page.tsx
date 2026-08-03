"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { SkyCareLogo } from "@/components/landing/skycare-logo";

export default function SignupPage() {  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="flex items-center justify-center">
          <SkyCareLogo size={40} />
        </div>
        <h1 className="mt-6 text-center text-lg font-semibold">Start your free trial</h1>
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
                  slug: form.get("slug"),
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
          <input
            type="text"
            name="hospitalName"
            required
            placeholder="Hospital name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
          />
          <input
            type="text"
            name="slug"
            required
            pattern="[a-z0-9-]+"
            placeholder="yourhospital  (yourhospital.skycare.app)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
          />
          <input
            type="text"
            name="fullName"
            required
            placeholder="Your full name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
          />
          <input
            type="email"
            name="email"
            required
            placeholder="Work email"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
          />
          <input
            type="tel"
            name="phone"
            placeholder="Phone (optional)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
          />
          <input
            type="password"
            name="password"
            required
            minLength={8}
            placeholder="Create password (8+ chars)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
          />
          <button
            type="submit"
            className="w-full rounded-lg sky-gradient py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Create my hospital
          </button>
        </form>
        <ul className="mt-6 space-y-1.5">
          {["Hospital management system", "Free hospital website", "Free patient PWA app"].map(
            (f) => (
              <li key={f} className="flex items-center gap-2 text-xs text-slate-500">
                <Check size={14} className="text-emerald-500" /> {f}
              </li>
            )
          )}
        </ul>
        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-sky-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}