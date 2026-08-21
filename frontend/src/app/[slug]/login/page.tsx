import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { CalendarCheck, ShieldCheck } from "lucide-react";
import { getHost, loadTenant } from "@/lib/tenant";
import LoginForm from "@/components/auth/login-form";
import LoginScene from "@/components/tenant/login-scene";

export const dynamic = "force-dynamic";

export default async function TenantLoginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const host = await getHost();
  const isLocalhost = !host || host === "localhost" || host.startsWith("localhost:");
  const { tenant } = await loadTenant(isLocalhost ? slug : host);
  if (!tenant) notFound();

  const home = `/${tenant.slug}`;

  return (
    <main>
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0F4C81] via-[#0B3A63] to-[#071E38]">
        <div className="pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-full bg-[#16A34A]/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-sky-500/15 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-32 md:pb-24 md:pt-40">
          <div className="overflow-hidden rounded-3xl bg-white shadow-2xl shadow-[#071E38]/40 ring-1 ring-white/20 lg:grid lg:grid-cols-[1.05fr_1fr]">
            <LoginScene />

            <div className="flex flex-col justify-center bg-white px-6 py-10 sm:px-10 md:py-14">
              <div className="max-w-md">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F0F7F2] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#15803D]">
                  <ShieldCheck size={13} /> Patient Login
                </span>
                <h1 className="mt-4 text-2xl font-extrabold text-[#0F4C81] sm:text-3xl">
                  Sign in to {tenant.name}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  Book appointments, view bills and results, and manage your family from any device.
                </p>

                <div className="mt-6">
                  <Suspense>
                    <LoginForm />
                  </Suspense>
                </div>

                <div className="mt-7 flex flex-col items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-5 py-4 sm:flex-row sm:justify-between">
                  <p className="text-center text-sm text-emerald-900 sm:text-left">
                    <span className="font-semibold">New patient?</span>{" "}
                    <span className="text-emerald-700">
                      Book an appointment first and our front desk will set you up.
                    </span>
                  </p>
                  <Link
                    href={`${home}/book`}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#16A34A] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#16A34A]/30 transition-all hover:bg-[#15803d] hover:shadow-lg active:scale-[0.97]"
                  >
                    <CalendarCheck size={15} /> Book Appointment
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}