"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";

export default function ForcePasswordChange({ userName }: { userName: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await getSupabase().auth.updateUser({
        password,
        data: { must_change_password: false },
      });
      if (updateError) throw new Error(updateError.message);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-100 via-blue-50 to-indigo-100 px-4 py-10">
      <div className="w-full max-w-md rounded-[24px] bg-white p-8 shadow-2xl shadow-sky-900/10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
          <KeyRound size={26} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-center text-xl font-bold text-slate-900">
          Set your own password
        </h1>
        <p className="mt-2 text-center text-sm text-slate-500">
          Welcome, {userName}. For your security, please choose a personal password to replace the
          welcome password given by your hospital.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="fp-pass" className="mb-1.5 block text-[13px] font-medium text-slate-700">
              New password
            </label>
            <div className="relative">
              <input
                id="fp-pass"
                type={show ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8+ characters"
                className="w-full rounded-xl border-[1.5px] border-slate-200 bg-slate-50/60 py-3 pl-4 pr-12 text-sm text-slate-800 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/10"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="focus-ring absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-600"
                aria-label={show ? "Hide password" : "Show password"}
                aria-pressed={show}
              >
                {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="fp-confirm" className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Confirm new password
            </label>
            <input
              id="fp-confirm"
              type={show ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat your password"
              className="w-full rounded-xl border-[1.5px] border-slate-200 bg-slate-50/60 py-3 pl-4 pr-4 text-sm text-slate-800 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/10"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-sky-700 hover:shadow-xl disabled:translate-y-0 disabled:opacity-60"
          >
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
            {busy ? "Saving…" : "Save password & continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
