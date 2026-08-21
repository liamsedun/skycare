"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { GoogleLogo, YahooLogo } from "@/components/brand-logos";

const OAUTH_PROVIDERS = [
  { id: "google", label: "Google", bg: "hover:bg-gray-50" },
  { id: "custom:yahoo", label: "Yahoo", bg: "hover:bg-purple-50" },
] as const;

function ProviderLogo({ id, className = "" }: { id: string; className?: string }) {
  switch (id) {
    case "google":
      return <GoogleLogo size={18} />;
    case "custom:yahoo":
      return <YahooLogo size={22} />;
    default:
      return <GoogleLogo size={18} />;
  }
}

export default function LoginForm() {
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
        return "This Google or Yahoo account isn't linked to a hospital account. Use your hospital email / patient number with a password, or ask your admin.";
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

    // Record the login audit + last_login_at, and gate deactivated accounts,
    // in a single round trip. Fall back to /api/auth/me if it fails.
    try {
      const res = await fetch("/api/auth/log-login", { method: "POST" });
      const body = await res.json();
      if (body?.data?.is_active === false) {
        await getSupabase().auth.signOut();
        setError("Your account has been deactivated. Contact your hospital admin.");
        setLoading(false);
        return;
      }
    } catch {
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
    }

    const fallback = role === "patient_api" ? "/patient" : "/app";
    router.push(redirectTo ?? fallback);
    router.refresh();
  }

  const providerLabels: Record<string, string> = {
    google: "Google",
    "custom:yahoo": "Yahoo",
  };

  async function signInWithOAuth(provider: (typeof OAUTH_PROVIDERS)[number]["id"]) {
    setError(null);
    setOauthBusy(provider);
    try {
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider: provider as "google" | "custom:yahoo",
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
