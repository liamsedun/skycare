import { Calendar, LogIn, MessageCircle } from "lucide-react";
import { tenantWhatsApp, type TenantSiteProfile } from "@/lib/tenant-site";

export default function TenantHero({
  tenant,
  stats,
}: {
  tenant: TenantSiteProfile;
  stats: { value: string; label: string }[];
}) {
  const home = `/${tenant.slug}`;
  const headline = tenant.tagline ?? `${tenant.name} — Care you can trust`;
  const split = headline.split("—");
  const lead = split[0]?.trim();
  const gradient = split[1]?.trim();

  const whatsapp = tenantWhatsApp(tenant);
  const heroBg = tenant.hero_image;

  return (
    <section id="home" className="relative flex min-h-screen flex-col justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628]/95 via-[#0f2a3f]/90 to-[#06223d]/95" />
      <div
        className="absolute inset-0 scale-105 bg-cover bg-center bg-no-repeat opacity-30 animate-[heroZoom_20s_ease-in-out_infinite]"
        style={{
          backgroundImage: heroBg
            ? `url('${heroBg}')`
            : "url('https://images.unsplash.com/photo-1746173098661-45ae0ccb6030?fm=jpg&q=80&w=1920&auto=format&fit=crop')",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#06223d]/80 via-[#0a1628]/40 to-transparent" />

      <div className="relative z-10 mx-auto max-w-7xl px-5 pb-16 pt-28 md:pb-20 md:pt-36">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#16A34A]" />
            Now accepting new patients
          </div>

          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
            {lead}
            {gradient && (
              <>
                {" "}
                <span className="bg-gradient-to-r from-[#16A34A] to-emerald-300 bg-clip-text text-transparent">
                  {gradient}
                </span>
              </>
            )}
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg md:text-xl">
            {tenant.about ??
              `Your health, our priority — caring community healthcare at ${tenant.name}.`}
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href={`${home}/login`}
              className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-white/40 bg-white/10 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white hover:text-[#0f2a3f] hover:shadow-lg active:scale-[0.97] sm:w-auto"
            >
              <LogIn size={18} />
              Patient Login
            </a>
            <a
              href={`${home}/book`}
              className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#16A34A] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#16A34A]/30 transition-all hover:bg-[#15803d] hover:shadow-xl hover:shadow-[#16A34A]/40 active:scale-[0.97] sm:w-auto"
            >
              <Calendar size={18} />
              Book Appointment
            </a>
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-white/30 px-7 py-3.5 text-sm font-semibold text-white transition-all hover:border-[#16A34A] hover:bg-[#16A34A] hover:shadow-lg hover:shadow-[#16A34A]/20 active:scale-[0.97] sm:w-auto"
              >
                <MessageCircle size={18} />
                Chat on WhatsApp
              </a>
            ) : (
              <a
                href={`tel:${tenant.phone}`}
                className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-white/30 px-7 py-3.5 text-sm font-semibold text-white transition-all hover:border-[#16A34A] hover:bg-[#16A34A] hover:shadow-lg hover:shadow-[#16A34A]/20 active:scale-[0.97] sm:w-auto"
              >
                <MessageCircle size={18} />
                Call Us
              </a>
            )}
          </div>
        </div>
      </div>

      {stats.length > 0 && (
        <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-8 md:pb-12">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 backdrop-blur-sm md:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center justify-center bg-white/5 px-4 py-6"
              >
                <span className="text-2xl font-bold text-white md:text-3xl">{stat.value}</span>
                <span className="mt-1 text-xs text-white/65 md:text-sm">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}