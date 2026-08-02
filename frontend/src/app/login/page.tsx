import Link from "next/link";
import { HeartPulse } from "lucide-react";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl sky-gradient text-white">
            <HeartPulse size={22} />
          </span>
          <span className="text-2xl font-bold">SkyCare</span>
        </div>
        <h1 className="mt-6 text-center text-lg font-semibold">Sign in to your hospital</h1>
        <p className="mt-1 text-center text-sm text-slate-500">
          Staff portal, patient portal & admin are on their way here.
        </p>
        <form className="mt-6 space-y-4" action="/api/auth/login" method="post">
          <input
            type="email"
            name="email"
            required
            placeholder="you@yourhospital.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
          />
          <input
            type="password"
            name="password"
            required
            placeholder="Password"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
          />
          <button
            type="submit"
            className="w-full rounded-lg sky-gradient py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Sign in
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          New hospital?{" "}
          <Link href="/signup" className="font-semibold text-sky-600 hover:underline">
            Start free trial
          </Link>
        </p>
      </div>
    </main>
  );
}