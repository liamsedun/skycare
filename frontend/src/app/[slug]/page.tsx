import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CalendarCheck,
  HeartPulse,
  Mail,
  MapPin,
  Phone,
  Stethoscope,
} from "lucide-react";
import { getHost, loadTenant } from "@/lib/tenant";
import TenantMobileNav from "@/components/tenant/tenant-mobile-nav";

export const dynamic = "force-dynamic";

export default async function TenantWebsitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const host = await getHost();
  const { tenant } = await loadTenant(host ?? slug);

  if (!tenant) notFound();

  const website = tenant.website as Record<string, string> | null;
  const tagline = website?.tagline ?? `${tenant.name} — care you can trust`;
  const about = website?.about ?? "Quality healthcare for your community.";

  return (
    <main className="min-h-screen bg-white">
      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {tenant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white">
                <HeartPulse size={18} />
              </span>
            )}
            <span className="truncate text-lg font-bold">{tenant.name}</span>
          </div>
          <nav className="hidden items-center gap-5 text-sm text-slate-600 md:flex">
            <a href="#about" className="hover:text-sky-600">About</a>
            <a href="#services" className="hover:text-sky-600">Services</a>
            <a href="#contact" className="hover:text-sky-600">Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href={`/appointment?hospital=${tenant.slug}`}
              className="hidden rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 sm:block"
            >
              Book Appointment
            </Link>
            <TenantMobileNav bookHref={`/appointment?hospital=${tenant.slug}`} />
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="bg-gradient-to-br from-sky-600 to-blue-800 py-20 text-white">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold md:text-5xl">{tagline}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sky-100">{about}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={`/appointment?hospital=${tenant.slug}`}
              className="flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-sky-700 hover:bg-sky-50"
            >
              <CalendarCheck size={18} /> Book an Appointment
            </Link>
            <a
              href={`tel:${tenant.phone}`}
              className="flex items-center gap-2 rounded-xl border border-white/40 px-6 py-3 font-semibold hover:bg-white/10"
            >
              <Phone size={18} /> Call Us
            </a>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold">Our Services</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              "General Consultation",
              "Cardiology",
              "Laboratory & Diagnostics",
              "Pharmacy",
              "Maternity & Pediatrics",
              "Emergency Care",
              "Surgery",
              "Vaccination",
            ].map((s) => (
              <div key={s} className="rounded-xl border border-slate-100 p-5 shadow-sm">
                <Stethoscope size={22} className="text-sky-600" />
                <p className="mt-3 font-semibold">{s}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold">Contact Us</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              { icon: Phone, label: "Phone", value: tenant.phone ?? "—" },
              { icon: Mail, label: "Email", value: tenant.email ?? "—" },
              { icon: MapPin, label: "Address", value: [tenant.address, tenant.city, tenant.state].filter(Boolean).join(", ") || "—" },
            ].map((c) => (
              <div key={c.label} className="flex items-center gap-3 rounded-xl bg-white p-5 shadow-sm">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
                  <c.icon size={20} />
                </span>
                <div>
                  <p className="text-xs text-slate-500">{c.label}</p>
                  <p className="text-sm font-semibold">{c.value}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-xs text-slate-400">
            Powered by SkyCare · The Smart Hospital OS for Africa
          </p>
        </div>
      </section>
    </main>
  );
}