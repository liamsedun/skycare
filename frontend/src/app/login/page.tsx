"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Activity, Cross, Eye, EyeOff, HeartPulse, Loader2, Mail, Stethoscope } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { SkyCareLogo } from "@/components/landing/skycare-logo";
import { FacebookLogo, GoogleLogo, YahooLogo } from "@/components/brand-logos";

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

const OAUTH_PROVIDERS = [
  { id: "google", label: "Google", bg: "hover:bg-gray-50" },
  { id: "custom:yahoo", label: "Yahoo", bg: "hover:bg-purple-50" },
  { id: "facebook", label: "Facebook", bg: "hover:bg-blue-50" },
] as const;

function ProviderLogo({ id, className = "" }: { id: string; className?: string }) {
  switch (id) {
    case "google":
      return <GoogleLogo size={18} />;
    case "custom:yahoo":
      return <YahooLogo size={22} />;
    case "facebook":
      return <FacebookLogo size={17} className={className} />;
    default:
      return <GoogleLogo size={18} />;
  }
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<string | null>(null);

  const redirectTo =
    searchParams.get("redirect") && searchParams.get("redirect")!.startsWith("/")
      ? searchParams.get("redirect")!
      : undefined;
  const oauthError = searchParams.get("error");

  function oauthErrorText(e: string): string {
    switch (e) {
      case "auth_callback":
        return "Social sign-in could not be completed. Try again or use your email / patient number with a password.";
      case "oauth_no_account":
        return "This Google, Yahoo or Facebook account isn't linked to a hospital account. Use your hospital email / patient number with a password, or ask your admin.";
      default:
        return "Something went wrong. Try again or use your email / patient number with a password.";
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    // Patient number or phone? Resolve to the auth email first.
    let email = identifier.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      try {
        const res = await fetch("/api/auth/resolve-identifier", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: email }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Could not resolve your account");
        email = body.data.email as string;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not resolve your account");
        setLoading(false);
        return;
      }
    }

    const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });

    if (error) {
      setError("Invalid email, patient number, phone or password. Check your details and try again.");
      setLoading(false);
      return;
    }

    const role = data.user?.app_metadata?.role as string | undefined;

    // Record the login audit + last_login_at (best effort)
    try {
      await fetch("/api/auth/log-login", { method: "POST" });
    } catch {
      /* ignore */
    }

    // Deactivated accounts must be blocked even with a valid auth session
    try {
      const me = await fetch("/api/auth/me", { method: "GET" });
      const meData = await me.json();
      if (meData.data?.user && meData.data.user.is_active === false) {
        await getSupabase().auth.signOut();
        setError("Your account has been deactivated. Contact your hospital admin.");
        setLoading(false);
        return;
      }
    } catch {
      /* ignore */
    }

    const fallback = role === "patient_api" ? "/patient" : "/app";
    router.push(redirectTo ?? fallback);
    router.refresh();
  }

  const providerLabels: Record<string, string> = {
    google: "Google",
    "custom:yahoo": "Yahoo",
    facebook: "Facebook",
  };

  async function signInWithOAuth(provider: (typeof OAUTH_PROVIDERS)[number]["id"]) {
    setError(null);
    setOauthBusy(provider);
    try {
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider: provider as "google" | "custom:yahoo" | "facebook",
        options: {
          redirectTo: `${window.location.origin}/auth/callback${
            redirectTo ? `?next=${encodeURIComponent(redirectTo)}` : ""
          }`,
        },
      });
      if (error) {
        setError(
          `${providerLabels[provider] ?? provider} sign-in is not enabled yet. Contact your hospital admin, or use your email / patient number with a password.`
        );
      }
    } catch {
      setError("Could not start social sign-in. Try a different method.");
    } finally {
      setOauthBusy(null);
    }
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-slate-700">
          Email, patient number or phone
        </label>
        <div className="relative">
          <input
            id="email"
            type="text"
            required
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@yourhospital.com or PT-0001"
            className="w-full rounded-xl border-[1.5px] border-slate-200 bg-slate-50/60 py-3 pl-4 pr-11 text-sm text-slate-800 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/10"
          />
          <Mail size={18} aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>
        <p className="mt-1 text-xs text-slate-400">Patients can sign in with their patient number, phone or email.</p>
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-slate-700">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
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
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600"
        >
          {error}
        </p>
      )}

      {!error && oauthError && (
        <p
          role="alert"
          className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700"
        >
          {oauthErrorText(oauthError)}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl sky-gradient py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-sky-500/30 disabled:translate-y-0 disabled:opacity-60"
      >
        {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
        {loading ? "Signing in…" : "Sign in"}
      </button>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">or continue with</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {OAUTH_PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => signInWithOAuth(p.id)}
            disabled={oauthBusy !== null}
            className={`focus-ring flex items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-slate-200 bg-white px-2 py-2.5 text-xs font-semibold text-slate-700 transition-all duration-200 hover:shadow-sm disabled:opacity-60 ${p.bg}`}
          >
            <span className="flex h-4 items-center justify-center">
              {oauthBusy === p.id ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <ProviderLogo id={p.id} className="shrink-0" />
              )}
            </span>
            {p.label}
          </button>
        ))}
      </div>
    </form>
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
          <h2 className="font-heading relative text-3xl font-bold">Welcome back.</h2>
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
