"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Loader2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { SkyCareLogo } from "@/components/landing/skycare-logo";

export const dynamic = "force-dynamic";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });

    if (error) {
      setError("Invalid email or password. Check your details and try again.");
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

    const redirectTo = searchParams.get("redirect");
    const fallback = role === "patient_api" ? "/patient" : "/app";
    router.push(
      redirectTo && redirectTo.startsWith("/")
        ? redirectTo
        : fallback
    );
    router.refresh();
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-[var(--color-foreground)]">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourhospital.com"
          className="focus-ring w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 placeholder:text-[var(--color-muted-fg)] focus:border-[var(--color-primary)]"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-[var(--color-foreground)]">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="focus-ring w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 placeholder:text-[var(--color-muted-fg)] focus:border-[var(--color-primary)]"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="focus-ring flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
      >
        {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-8 shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-center">
          <SkyCareLogo size={40} />
        </div>
        <h1 className="mt-6 text-center text-lg font-semibold">
          Sign in to your hospital
        </h1>
        <p className="mt-1 text-center text-sm text-[var(--color-muted-fg)]">
          Staff portal for your hospital&apos;s day-to-day operations.
        </p>
        <Suspense>
          <LoginForm />
        </Suspense>
        <p className="mt-6 text-center text-sm text-[var(--color-muted-fg)]">
          New hospital?{" "}
          <Link href="/signup" className="font-semibold text-[var(--color-primary)] transition-colors duration-200 hover:underline">
            Start free trial
          </Link>
        </p>
      </div>
    </main>
  );
}
