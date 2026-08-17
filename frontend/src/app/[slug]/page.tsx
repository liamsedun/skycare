import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CalendarCheck, Phone } from "lucide-react";
import { getHost, loadTenant } from "@/lib/tenant";
import {
  DEFAULT_SERVICES,
  loadLandingDoctors,
  loadWebsiteServices,
  serviceIcon,
} from "@/lib/tenant-site";
import { ContactCards } from "@/components/tenant/site-sections";

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

  const home = `/${tenant.slug}`;
  const tagline = tenant.tagline ?? `${tenant.name} — care you can trust`;
  const about = tenant.about ?? "Quality healthcare for your community.";

  const services = await loadWebsiteServices(tenant.id);

  return (
    <main>
      {/* HERO */}
      <section className="[background:linear-gradient(135deg,var(--brand),color-mix(in_srgb,var(--brand)_60%,#000))] py-20 text-white">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold md:text-5xl">{tagline}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-white/85">{about}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={`${home}/book`}
              className="flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-slate-800 hover:bg-slate-100"
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
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-2xl font-bold">Our Services</h2>
            <Link
              href={`${home}/services`}
              className="flex items-center gap-1 text-sm font-semibold [color:var(--brand)] hover:underline"
            >
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {(services.length > 0
              ? services.map((s) => ({ id: s.id, name: s.name, description: s.description, icon: s.icon }))
              : DEFAULT_SERVICES.map((name, i) => ({ id: `default-${i}`, name, description: null, icon: null }))
            ).map((s) => {
              const Icon = serviceIcon(s.icon);
              return (
                <div key={s.id} className="rounded-xl border border-slate-100 p-5 shadow-sm">
                  <span className="inline-block [background:color-mix(in_srgb,var(--brand)_12%,transparent)] p-2.5 rounded-lg">
                    <Icon size={22} className="[color:var(--brand)]" />
                  </span>
                  <p className="mt-3 font-semibold">{s.name}</p>
                  {s.description && <p className="mt-1 text-sm text-slate-600">{s.description}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ABOUT TEASER */}
      <section className="bg-slate-50 py-16">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold">About {tenant.name}</h2>
            <p className="mt-3 leading-relaxed text-slate-600">
              {about} Our doors are open to every member of the community — from routine
              check-ups to emergency care, with a dedicated team of doctors, nurses and
              specialists on hand.
            </p>
            <Link
              href={`${home}/about`}
              className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 [background:var(--brand)]"
            >
              Learn more <ArrowRight size={15} />
            </Link>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="font-semibold">Why patients choose us</h3>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              {[
                "Experienced doctors & specialists",
                "Modern laboratory and diagnostics",
                "24/7 emergency response",
                "Affordable, transparent pricing",
                "Online appointment booking & patient portal",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full [background:var(--brand)]" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold">Contact Us</h2>
          <ContactCards tenant={tenant} />
        </div>
      </section>
    </main>
  );
}
