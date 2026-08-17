import { notFound } from "next/navigation";
import Link from "next/link";
import { Clock, HeartPulse, Mail, MapPin, Phone, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { getHost, loadTenant } from "@/lib/tenant";
import TenantMobileNav from "@/components/tenant/tenant-mobile-nav";

export const dynamic = "force-dynamic";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "skycare.app";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${ROOT_DOMAIN}`;

type TenantProfile = NonNullable<Awaited<ReturnType<typeof loadTenant>>["tenant"]>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const host = await getHost();
  const { tenant } = await loadTenant(host ?? slug);
  if (!tenant) return { title: "Hospital" };

  const tagline = tenant.tagline ?? `${tenant.name} — care you can trust`;
  const about =
    tenant.about ??
    "Quality healthcare for your community. Book an appointment online or call us today.";

  const title = tenant.seo_title ?? `${tenant.name} — ${tagline}`;
  const description = tenant.seo_description ?? about;
  const canonical = `${SITE_URL}/${slug}`;
  const icon = tenant.favicon_url ?? tenant.logo_url;

  return {
    title,
    description,
    icons: icon ? { icon: icon } : undefined,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: tenant.name,
      type: "website",
      images: tenant.hero_image ?? tenant.logo_url ?? undefined,
    },
  };
}

export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const host = await getHost();
  const { tenant } = await loadTenant(host ?? slug);
  if (!tenant) notFound();

  const brand = tenant.brand_color || "#0284c7";
  const home = `/${tenant.slug}`;

  const navLinks = [
    { href: home, label: "Home" },
    { href: `${home}/about`, label: "About" },
    { href: `${home}/services`, label: "Services" },
    { href: `${home}/departments`, label: "Departments" },
    { href: `${home}/doctors`, label: "Doctors" },
    { href: `${home}/contact`, label: "Contact" },
  ];

  const suspended =
    tenant.subscription_status === "suspended" ||
    tenant.subscription_status === "cancelled";

  const address = [tenant.address, tenant.city, tenant.state].filter(Boolean).join(", ") || null;

  return (
    <div
      style={{ "--brand": brand } as CSSProperties}
      className="min-h-screen bg-white font-[family-name:var(--font-sans)] text-slate-900"
    >
      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href={home} className="flex min-w-0 items-center gap-2">
            {tenant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
            ) : (
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                style={{ background: brand }}
              >
                <HeartPulse size={18} />
              </span>
            )}
            <span className="truncate text-lg font-bold">{tenant.name}</span>
          </Link>
          <nav className="hidden items-center gap-5 text-sm text-slate-600 md:flex">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className="hover:opacity-75">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 sm:block"
            >
              Patient login
            </Link>
            <Link
              href={`${home}/book`}
              className="hidden rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 sm:block"
              style={{ background: brand }}
            >
              Book Appointment
            </Link>
            <TenantMobileNav links={navLinks} bookHref={`${home}/book`} />
          </div>
        </div>
      </header>

      {suspended && (
        <div className="bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800">
          <TriangleAlert size={12} className="mr-1 inline" />
          This site is temporarily unavailable — please contact the hospital directly.
        </div>
      )}

      {children}

      {/* FOOTER */}
      <footer className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              {tenant.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tenant.logo_url} alt="" className="h-8 w-8 rounded-lg object-contain" />
              ) : (
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
                  style={{ background: brand }}
                >
                  <HeartPulse size={15} />
                </span>
              )}
              <span className="font-bold">{tenant.name}</span>
            </div>
            <p className="mt-3 text-sm text-slate-500">{tenant.tagline ?? "Care you can trust."}</p>
          </div>
          <div>
            <p className="text-sm font-semibold">Contact</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {tenant.phone && (
                <li className="flex items-center gap-2">
                  <Phone size={14} className="text-slate-400" />
                  <a href={`tel:${tenant.phone}`} className="hover:underline">{tenant.phone}</a>
                </li>
              )}
              {tenant.email && (
                <li className="flex items-center gap-2">
                  <Mail size={14} className="text-slate-400" />
                  <a href={`mailto:${tenant.email}`} className="hover:underline">{tenant.email}</a>
                </li>
              )}
              {address && (
                <li className="flex items-start gap-2">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
                  <span>{address}</span>
                </li>
              )}
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold">Opening hours</p>
            <p className="mt-3 text-sm text-slate-600">
              {tenant.emergency_phone ? (
                <>
                  Emergency:{" "}
                  <a href={`tel:${tenant.emergency_phone}`} className="font-medium hover:underline">
                    {tenant.emergency_phone}
                  </a>
                </>
              ) : (
                "Mon–Sat · 8:00am – 6:00pm"
              )}
            </p>
            <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <Clock size={14} className="text-slate-400" />
              Walk-ins welcome
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold">Patients</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>
                <Link href="/login" className="hover:underline">Patient portal login</Link>
              </li>
              <li>
                <Link href={`${home}/book`} className="hover:underline">Book an appointment</Link>
              </li>
              <li>
                <Link href={`${home}/contact`} className="hover:underline">Contact us</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
          Powered by SkyCare · The Smart Hospital OS for Africa
        </div>
      </footer>
    </div>
  );
}
