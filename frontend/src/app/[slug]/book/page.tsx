import { notFound } from "next/navigation";
import {
  CalendarCheck,
  Clock,
  Headset,
  Phone,
  ShieldCheck,
  Smartphone,
  UserCheck,
  Users,
} from "lucide-react";
import { getHost, isLocalHost, loadTenant } from "@/lib/tenant";
import { createServiceClient } from "@/lib/supabase/server";
import BookAppointmentForm from "@/components/tenant/book-form";
import Reveal from "@/components/tenant/reveal";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    icon: CalendarCheck,
    title: "Send your request",
    text: "Fill in your details, preferred date and time below.",
  },
  {
    icon: Headset,
    title: "We call to confirm",
    text: "Our front desk phones you to lock in your appointment time.",
  },
  {
    icon: UserCheck,
    title: "Arrive & get seen",
    text: "Come in 10 minutes early with a valid ID and see your doctor.",
  },
  {
    icon: Smartphone,
    title: "Follow up online",
    text: "Track bills, results and notes through your patient portal.",
  },
];

export default async function TenantBookPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const host = await getHost();
  const isLocalhost = isLocalHost(host);
  const { tenant } = await loadTenant(isLocalhost ? slug : host);
  if (!tenant) notFound();

  const home = `/${tenant.slug}`;
  const svc = createServiceClient();
  const { data: branches } = await svc
    .from("branches")
    .select("id, name")
    .eq("tenant_id", tenant.id)
    .eq("is_active", true)
    .order("is_main", { ascending: false })
    .order("name", { ascending: true });

  const assurances = [
    { icon: ShieldCheck, label: "Secure & confidential" },
    { icon: Clock, label: "Fast confirmation" },
    { icon: Users, label: "Family & staff friendly" },
  ];

  return (
    <main>
      {/* Hero band */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0F4C81] via-[#0B3A63] to-[#071E38]">
        <div className="pointer-events-none absolute -left-24 top-8 h-80 w-80 rounded-full bg-[#16A34A]/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-sky-500/15 blur-3xl" />
        <svg className="tenant-floaty absolute left-[10%] top-[30%] hidden md:block" width="16" height="16" viewBox="0 0 24 24" fill="#fff" opacity="0.25" aria-hidden="true">
          <rect x="10" y="2" width="4" height="20" rx="2" />
          <rect x="2" y="10" width="20" height="4" rx="2" />
        </svg>
        <svg className="tenant-floaty tenant-floaty-d2 absolute right-[12%] top-[28%] hidden md:block" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" opacity="0.3" aria-hidden="true">
          <path className="tenant-pulse-line" d="M2 12h4l2-7 4 14 3-9 2 4h5" />
        </svg>

        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-36 text-center md:pb-20 md:pt-44">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-medium text-white/85 backdrop-blur-sm">
              <CalendarCheck size={13} /> Online Booking
            </span>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Book an Appointment
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-white/80 sm:text-lg">
              Request a visit in under a minute — our team will confirm by phone.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Booking body */}
      <section className="bg-[#F7F9FC] py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid items-start gap-10 lg:grid-cols-[1fr_400px]">
            <Reveal>
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xl shadow-[#0B3A63]/5 sm:p-8">
                <div className="mb-6 flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#F0F7F2] text-[#16A34A]">
                    <CalendarCheck size={22} />
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-[#0F4C81]">Request your visit</h2>
                    <p className="text-xs text-slate-500">
                      Fields marked * are required. We&apos;ll confirm by phone.
                    </p>
                  </div>
                </div>
                <BookAppointmentForm
                  tenantSlug={tenant.slug}
                  tenantName={tenant.name}
                  branches={(branches ?? []).map((b) => ({ id: b.id, name: b.name }))}
                />
              </div>
            </Reveal>

            <div className="space-y-5">
              <Reveal delay={120}>
                <div className="rounded-3xl border border-slate-100 bg-white p-7 shadow-xl shadow-[#0B3A63]/5">
                  <h3 className="flex items-center gap-2 font-bold text-[#0F4C81]">
                    <Clock size={18} className="text-[#16A34A]" /> What happens next?
                  </h3>
                  <ol className="mt-5 space-y-5">
                    {STEPS.map((step, i) => (
                      <li key={step.title} className="relative flex gap-4">
                        {i < STEPS.length - 1 && (
                          <span className="absolute left-[21px] top-11 h-[calc(100%-28px)] w-px bg-slate-200" />
                        )}
                        <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EAF0F7] text-[#0F4C81]">
                          <step.icon size={19} />
                        </span>
                        <div>
                          <p className="font-semibold text-[#1F2D3D]">{step.title}</p>
                          <p className="mt-0.5 text-sm text-slate-600">{step.text}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </Reveal>

              <Reveal delay={220}>
                <div className="rounded-3xl border border-slate-100 bg-white p-7 shadow-xl shadow-[#0B3A63]/5">
                  <h3 className="flex items-center gap-2 font-bold text-[#0F4C81]">
                    <Phone size={18} className="text-[#16A34A]" /> Prefer to call?
                  </h3>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    {tenant.phone && (
                      <p>
                        Call{" "}
                        <a
                          href={`tel:${tenant.phone}`}
                          className="font-semibold text-[#0F4C81] hover:underline"
                        >
                          {tenant.phone}
                        </a>
                      </p>
                    )}
                    {tenant.emergency_phone && (
                      <p>
                        Emergency:{" "}
                        <a
                          href={`tel:${tenant.emergency_phone}`}
                          className="font-semibold text-[#0F4C81] hover:underline"
                        >
                          {tenant.emergency_phone}
                        </a>
                      </p>
                    )}
                  </div>
                </div>
              </Reveal>

              <Reveal delay={320}>
                <div className="grid grid-cols-3 gap-2">
                  {assurances.map((a) => (
                    <div
                      key={a.label}
                      className="flex flex-col items-center gap-2 rounded-2xl bg-white/70 px-2 py-4 text-center ring-1 ring-slate-100"
                    >
                      <a.icon size={18} className="text-[#16A34A]" />
                      <p className="text-[11px] font-medium text-slate-600">{a.label}</p>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>

          <Reveal delay={150} className="mt-14 text-center">
            <a
              href={`${home}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0F4C81] transition-colors hover:text-[#16A34A]"
            >
              ← Back to Home
            </a>
          </Reveal>
        </div>
      </section>
    </main>
  );
}