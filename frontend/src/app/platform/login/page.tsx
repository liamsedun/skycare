"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useCallback, useRef, useEffect } from "react";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

function PlatformLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");

  const [lampOn, setLampOn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const hintRef = useRef<HTMLDivElement>(null);

  const toggleLamp = useCallback(() => {
    setLampOn((prev) => {
      const next = !prev;
      if (hintRef.current) hintRef.current.style.opacity = next ? "0" : "0.85";
      return next;
    });
  }, []);

  // keyboard on the lamp
  function handleLampKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleLamp();
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error: authError } = await getSupabase().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      setError("Invalid email or password. Try again.");
      setLoading(false);
      return;
    }

    const role = data.user?.app_metadata?.role as string | undefined;
    const tenantId = data.user?.app_metadata?.tenant_id as string | undefined;

    if (role !== "super_admin") {
      await getSupabase().auth.signOut();
      setError("This login is for SkyCare platform administrators only.");
      setLoading(false);
      return;
    }

    if (tenantId) {
      await getSupabase().auth.signOut();
      setError("Platform admin accounts must not be assigned to a hospital.");
      setLoading(false);
      return;
    }

    router.push(redirectTo && redirectTo.startsWith("/") ? redirectTo : "/platform/dashboard");
    router.refresh();
  }

  return (
    <div className={`plamp-stage${lampOn ? " lit" : ""}`}>
      {/* Lamp */}
      <div
        className={`plamp-wrap${lampOn ? " plamp-lit" : ""}`}
        role="button"
        aria-label="Toggle lamp"
        tabIndex={0}
        onClick={toggleLamp}
        onKeyDown={handleLampKey}
      >
        <div className="plamp-hint" ref={hintRef}>
          click the lamp
        </div>
        <div className="plamp-beam" />
        <div className="plamp-cord" />
        <div className="plamp-shade" />
        <div className="plamp-shade-glow" />
        <div className="plamp-face">
          <div className="plamp-eye l" />
          <div className="plamp-eye r" />
          <div className="plamp-mouth">
            <div className="plamp-tongue" />
          </div>
          <div className="plamp-cheek l" />
          <div className="plamp-cheek r" />
        </div>
        <div className="plamp-pole" />
        <div className="plamp-base" />
        <div className="plamp-shadow-pool" />
      </div>

      {/* Login card */}
      <form
        className={`plamp-card${lampOn ? " show" : ""}`}
        onSubmit={handleSubmit}
        autoComplete="off"
      >
        <div className="flex justify-center mb-4">
          <img src="/icons/icon-192.png" alt="SkyCare" className="h-16 w-16 rounded-xl object-contain" />
        </div>
        <h1>Welcome Back</h1>

        <div className="plamp-field">
          <label htmlFor="plamp-email">Email address</label>
          <input
            id="plamp-email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@skycare.app"
          />
        </div>

        <div className="plamp-field">
          <label htmlFor="plamp-password">Password</label>
          <div style={{ position: "relative" }}>
            <input
              id="plamp-password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "#566173",
                cursor: "pointer",
                padding: 4,
                display: "flex",
                alignItems: "center",
              }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              marginBottom: 16,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid rgba(220,38,38,0.25)",
              background: "rgba(220,38,38,0.08)",
              color: "#f87171",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          className="plamp-login-btn"
          disabled={loading}
        >
          {loading ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
              Signing in...
            </span>
          ) : (
            "Login"
          )}
        </button>

        <div className="plamp-footer-links">
          <a href="/login">Hospital portal</a>
        </div>
      </form>

      {/* Idle message */}
      <div className="plamp-idle-msg">
        Click the lamp to sign in
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function PlatformLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="plamp-stage">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#e0a84a" }} />
        </div>
      }
    >
      <PlatformLoginForm />
    </Suspense>
  );
}
